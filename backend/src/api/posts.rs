//! `/api/posts` handlers — the community feed.
//!
//! Unlike canvases, a post is *public*: the feed is everybody's, so `list`
//! and `get` are not scoped to the caller. What the caller's identity
//! decides is what they may change — their own reactions, their own
//! comments, their own posts — and that check lives in the query filter
//! (see `crate::posts`) rather than in a branch here, so there is no path
//! that forgets it.

use super::{mongo_error, AppState};
use crate::posts::{self, NewPost, Reaction};
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::json;

/// Long enough for a real write-up, short enough that a single document
/// can't be used to fill the database.
const MAX_BODY_CHARS: usize = 20_000;
const MAX_COMMENT_CHARS: usize = 2_000;

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "post not found" }))).into_response()
}

fn bad_request(message: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response()
}

pub async fn list(State(state): State<AppState>, Extension(jwt): Extension<ClerkJwt>) -> Response {
    match posts::list(&state.mongo, &jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => mongo_error(e, "post list"),
    }
}

pub async fn saved(State(state): State<AppState>, Extension(jwt): Extension<ClerkJwt>) -> Response {
    match posts::saved(&state.mongo, &jwt.sub).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => mongo_error(e, "saved posts"),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match posts::get(&state.mongo, &jwt.sub, &id).await {
        Ok(Some(post)) => (StatusCode::OK, Json(post)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "post get"),
    }
}

#[derive(serde::Deserialize)]
pub struct CreateRequest {
    title: String,
    body: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    accent: Option<String>,
    #[serde(default)]
    read_time: Option<String>,
    /// The canvas attachments — each a diagram, a graph, and the metadata
    /// naming the run. Opaque to this backend (see `posts::Post::canvases`).
    canvases: Vec<serde_json::Value>,
}

/// How many canvases one post may carry.
///
/// Not a storage limit — each attachment is a few kB and MongoDB's ceiling
/// is 16MB — but a reading one. A carousel is something you click through,
/// and past about this many the post has stopped being "here is a thing I
/// traced" and become an album.
const MAX_CANVASES: usize = 8;

pub async fn create(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Json(req): Json<CreateRequest>,
) -> Response {
    if req.title.trim().is_empty() {
        return bad_request("a post needs a title");
    }
    let body: Vec<String> = req
        .body
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if body.is_empty() {
        return bad_request("a post needs something to say");
    }
    if body.iter().map(String::len).sum::<usize>() > MAX_BODY_CHARS {
        return bad_request("that post is too long");
    }

    // The attachment is the post. A trace nobody can look at is a blog
    // entry, and this feed is for the drawings — so this is a rejection,
    // not a default.
    if req.canvases.is_empty() {
        return bad_request("a post needs at least one canvas attached");
    }
    if req.canvases.len() > MAX_CANVASES {
        return bad_request(&format!("a post can carry at most {MAX_CANVASES} canvases"));
    }
    let mut canvases = Vec::with_capacity(req.canvases.len());
    for canvas in &req.canvases {
        match mongodb::bson::to_document(canvas) {
            Ok(doc) => canvases.push(doc),
            Err(e) => return bad_request(&format!("that canvas attachment can't be stored: {e}")),
        }
    }

    // Author name and handle come from the verified token, never from the
    // request body — otherwise anyone could publish under anyone's name.
    let user = match crate::users::get(&state.pool, &jwt.sub).await {
        Ok(user) => user,
        Err(e) => return super::db_error(e),
    };
    let author = user
        .as_ref()
        .and_then(|u| u.full_name.clone().or_else(|| u.username.clone()))
        .unwrap_or_else(|| "A Lattice user".to_string());
    let handle = user
        .as_ref()
        .and_then(|u| u.username.clone())
        .or_else(|| user.as_ref().and_then(|u| u.email.as_ref()?.split('@').next().map(str::to_string)))
        .unwrap_or_else(|| jwt.sub.clone());

    let new = NewPost {
        title: req.title.trim().to_string(),
        // A rough words-per-minute estimate, computed once at publish
        // rather than on every render — it can't change after the fact.
        read_time: req
            .read_time
            .unwrap_or_else(|| format!("{} min read", body.iter().map(|p| p.split_whitespace().count()).sum::<usize>().div_ceil(200).max(1))),
        body,
        author,
        handle: format!("@{}", handle.trim_start_matches('@')),
        tags: req.tags.into_iter().filter(|t| !t.trim().is_empty()).take(6).collect(),
        accent: req.accent.unwrap_or_else(|| "#f0803c".to_string()),
        canvases,
    };

    if let Err(e) = crate::users::ensure(&state.pool, &jwt.sub).await {
        return super::db_error(e);
    }
    match posts::create(&state.mongo, &jwt.sub, new).await {
        Ok(post) => (StatusCode::CREATED, Json(post)).into_response(),
        Err(e) => mongo_error(e, "post create"),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
) -> Response {
    match posts::delete(&state.mongo, &jwt.sub, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        // Also the answer for somebody else's post, and for the seeded
        // ones that belong to nobody — a caller learns only that they
        // can't delete it, not whose it is.
        Ok(false) => not_found(),
        Err(e) => mongo_error(e, "post delete"),
    }
}

#[derive(serde::Deserialize)]
pub struct ReactionRequest {
    on: bool,
}

pub async fn like(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(req): Json<ReactionRequest>,
) -> Response {
    react(state, jwt, id, Reaction::Like, req.on).await
}

pub async fn save(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(req): Json<ReactionRequest>,
) -> Response {
    react(state, jwt, id, Reaction::Save, req.on).await
}

async fn react(state: AppState, jwt: ClerkJwt, id: String, kind: Reaction, on: bool) -> Response {
    match posts::set_reaction(&state.mongo, &jwt.sub, &id, kind, on).await {
        Ok(Some(post)) => (StatusCode::OK, Json(post)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "post reaction"),
    }
}

#[derive(serde::Deserialize)]
pub struct CommentRequest {
    body: String,
}

pub async fn comment(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path(id): Path<String>,
    Json(req): Json<CommentRequest>,
) -> Response {
    let body = req.body.trim();
    if body.is_empty() {
        return bad_request("a comment needs something in it");
    }
    if body.len() > MAX_COMMENT_CHARS {
        return bad_request("that comment is too long");
    }

    let user = match crate::users::get(&state.pool, &jwt.sub).await {
        Ok(user) => user,
        Err(e) => return super::db_error(e),
    };
    let author = user
        .and_then(|u| u.full_name.or(u.username))
        .unwrap_or_else(|| "A Lattice user".to_string());

    match posts::add_comment(&state.mongo, &jwt.sub, &author, &id, body).await {
        Ok(Some(post)) => (StatusCode::CREATED, Json(post)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "post comment"),
    }
}

pub async fn delete_comment(
    State(state): State<AppState>,
    Extension(jwt): Extension<ClerkJwt>,
    Path((id, comment_id)): Path<(String, String)>,
) -> Response {
    match posts::delete_comment(&state.mongo, &jwt.sub, &id, &comment_id).await {
        Ok(Some(post)) => (StatusCode::OK, Json(post)).into_response(),
        Ok(None) => not_found(),
        Err(e) => mongo_error(e, "comment delete"),
    }
}
