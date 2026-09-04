//! The community feed, stored in MongoDB (§ crate::mongo).
//!
//! A post is one document holding everything the feed renders: the prose,
//! the canvas attachments it was built around, and the reactions it has
//! collected. Likes, saves and comments are embedded rather than kept in
//! their own collections because they are only ever read *with* the post
//! and only ever written one at a time — the join a relational schema
//! would need here would buy nothing.
//!
//! Two shapes, on purpose. `Post` is what is stored; `PostView` is what
//! goes over the wire. The difference is that storage keeps the full
//! `liked_by` and `saved_by` lists and the wire sends a count plus two
//! booleans for *the caller* — so a client can render "you liked this"
//! without ever receiving the list of everyone who did.

use crate::mongo;
use mongodb::bson::{doc, Document};
use mongodb::options::ReturnDocument;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

use crate::canvases::{collect, Result};

fn posts(db: &Database) -> Collection<Post> {
    mongo::collection(db, mongo::POSTS)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: String,
    /// The Clerk id of whoever published it, or `None` for the posts
    /// Lattice ships with — those belong to nobody, so nobody can edit or
    /// delete them, and the check is a null check rather than a special
    /// user id nobody can sign in as.
    #[serde(default)]
    pub owner_id: Option<String>,
    pub title: String,
    /// One or more paragraphs. An array rather than a blob with newlines
    /// so the card can show the first as a preview without re-splitting a
    /// string.
    pub body: Vec<String>,
    pub author: String,
    pub handle: String,
    pub published_at: String,
    pub read_time: String,
    pub tags: Vec<String>,
    pub accent: String,
    /// The canvases the post is built around — each one a diagram, a
    /// graph and the metadata naming the run. Opaque here: they are
    /// rendered by the same frontend geometry the Visualizer uses, and
    /// nothing on this side needs to look inside them.
    ///
    /// A post always has at least one (see `api::posts::create`); a post
    /// with nothing attached is prose, and this feed is for traces.
    #[serde(default)]
    pub canvases: Vec<Document>,
    /// What `canvases` used to be, before a post could carry more than
    /// one. Read-only and never written: it exists so documents stored
    /// under the old shape still load, and `view` folds it into the array
    /// above. Drop it once nothing in the database has it.
    #[serde(default, skip_serializing)]
    pub canvas: Option<Document>,
    #[serde(default)]
    pub liked_by: Vec<String>,
    #[serde(default)]
    pub saved_by: Vec<String>,
    #[serde(default)]
    pub comments: Vec<Comment>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub author: String,
    /// `None` on the seeded comments, which belong to made-up people.
    #[serde(default)]
    pub author_id: Option<String>,
    pub body: String,
    pub created_at: String,
}

/// A post as the feed receives it. `camelCase` because that is the shape
/// `frontend/lib/posts/types.ts` already reads.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostView {
    pub id: String,
    pub title: String,
    pub body: Vec<String>,
    pub author: String,
    pub handle: String,
    pub published_at: String,
    pub read_time: String,
    pub tags: Vec<String>,
    pub accent: String,
    /// Newest-first is meaningless here — this is the order the author
    /// attached them, which is the order the carousel steps through.
    pub canvases: Vec<Document>,
    /// Everyone's likes, including the caller's — a count, never the list.
    pub likes: usize,
    pub liked: bool,
    pub saved: bool,
    /// Whether the caller published this, and may therefore delete it.
    pub mine: bool,
    pub comments: Vec<CommentView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentView {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: String,
    /// Whether the caller wrote it, and may therefore delete it.
    pub mine: bool,
}

impl Post {
    pub fn view(self, viewer: &str) -> PostView {
        PostView {
            id: self.id,
            title: self.title,
            body: self.body,
            author: self.author,
            handle: self.handle,
            published_at: self.published_at,
            read_time: self.read_time,
            tags: self.tags,
            accent: self.accent,
            // One shape out, whichever shape went in.
            canvases: if self.canvases.is_empty() {
                self.canvas.into_iter().collect()
            } else {
                self.canvases
            },
            likes: self.liked_by.len(),
            liked: self.liked_by.iter().any(|u| u == viewer),
            saved: self.saved_by.iter().any(|u| u == viewer),
            mine: self.owner_id.as_deref() == Some(viewer),
            comments: self
                .comments
                .into_iter()
                .map(|c| CommentView {
                    mine: c.author_id.as_deref() == Some(viewer),
                    id: c.id,
                    author: c.author,
                    body: c.body,
                    created_at: c.created_at,
                })
                .collect(),
        }
    }
}

/// The whole feed, newest first. Not paginated: the feed is small, and a
/// cursor API that nothing scrolls would be scaffolding for a problem this
/// doesn't have yet.
pub async fn list(db: &Database, viewer: &str) -> Result<Vec<PostView>> {
    let cursor = posts(db)
        .find(doc! {})
        .sort(doc! { "published_at": -1 })
        .await?;
    Ok(collect(cursor).await?.into_iter().map(|p| p.view(viewer)).collect())
}

/// Just the posts this viewer saved, in the order the feed shows them.
pub async fn saved(db: &Database, viewer: &str) -> Result<Vec<PostView>> {
    let cursor = posts(db)
        .find(doc! { "saved_by": viewer })
        .sort(doc! { "published_at": -1 })
        .await?;
    Ok(collect(cursor).await?.into_iter().map(|p| p.view(viewer)).collect())
}

pub async fn get(db: &Database, viewer: &str, id: &str) -> Result<Option<PostView>> {
    Ok(posts(db).find_one(doc! { "id": id }).await?.map(|p| p.view(viewer)))
}

pub struct NewPost {
    pub title: String,
    pub body: Vec<String>,
    pub author: String,
    pub handle: String,
    pub read_time: String,
    pub tags: Vec<String>,
    pub accent: String,
    pub canvases: Vec<Document>,
}

pub async fn create(db: &Database, owner_id: &str, new: NewPost) -> Result<PostView> {
    let timestamp = mongo::now();
    let post = Post {
        id: uuid::Uuid::new_v4().to_string(),
        owner_id: Some(owner_id.to_string()),
        title: new.title,
        body: new.body,
        author: new.author,
        handle: new.handle,
        published_at: timestamp.clone(),
        read_time: new.read_time,
        tags: new.tags,
        accent: new.accent,
        canvases: new.canvases,
        canvas: None,
        liked_by: Vec::new(),
        saved_by: Vec::new(),
        comments: Vec::new(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    posts(db).insert_one(&post).await?;
    Ok(post.view(owner_id))
}

/// Only the author can delete, and the seeded posts have no author — so
/// the ownership clause in the filter is also what protects them.
pub async fn delete(db: &Database, owner_id: &str, id: &str) -> Result<bool> {
    let result = posts(db)
        .delete_one(doc! { "id": id, "owner_id": owner_id })
        .await?;
    Ok(result.deleted_count > 0)
}

/// Adds or removes the viewer from `liked_by` / `saved_by`.
///
/// `$addToSet` and `$pull` rather than reading the array, changing it and
/// writing it back: the update is one atomic operation, so two tabs
/// double-tapping the same post can't lose one of the reactions, and
/// liking twice is idempotent by construction rather than by a check that
/// could race.
pub async fn set_reaction(
    db: &Database,
    viewer: &str,
    id: &str,
    field: Reaction,
    on: bool,
) -> Result<Option<PostView>> {
    let key = field.field();
    let update = if on {
        doc! { "$addToSet": { key: viewer } }
    } else {
        doc! { "$pull": { key: viewer } }
    };
    Ok(posts(db)
        .find_one_and_update(doc! { "id": id }, update)
        .return_document(ReturnDocument::After)
        .await?
        .map(|p| p.view(viewer)))
}

#[derive(Clone, Copy)]
pub enum Reaction {
    Like,
    Save,
}

impl Reaction {
    fn field(self) -> &'static str {
        match self {
            Self::Like => "liked_by",
            Self::Save => "saved_by",
        }
    }
}

pub async fn add_comment(
    db: &Database,
    viewer: &str,
    author: &str,
    id: &str,
    body: &str,
) -> Result<Option<PostView>> {
    let comment = Comment {
        id: uuid::Uuid::new_v4().to_string(),
        author: author.to_string(),
        author_id: Some(viewer.to_string()),
        body: body.to_string(),
        created_at: mongo::now(),
    };
    let comment = mongodb::bson::to_document(&comment)?;
    Ok(posts(db)
        .find_one_and_update(doc! { "id": id }, doc! { "$push": { "comments": comment } })
        .return_document(ReturnDocument::After)
        .await?
        .map(|p| p.view(viewer)))
}

/// Removes one of the viewer's own comments. The `author_id` clause is the
/// authorization: a comment somebody else wrote simply doesn't match.
pub async fn delete_comment(
    db: &Database,
    viewer: &str,
    id: &str,
    comment_id: &str,
) -> Result<Option<PostView>> {
    Ok(posts(db)
        .find_one_and_update(
            doc! { "id": id },
            doc! { "$pull": { "comments": { "id": comment_id, "author_id": viewer } } },
        )
        .return_document(ReturnDocument::After)
        .await?
        .map(|p| p.view(viewer)))
}

/// One comment on one of `recipient`'s own posts, written by someone else —
/// the You page's Notifications widget.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NotificationView {
    pub id: String,
    pub author: String,
    pub post_title: String,
    pub excerpt: String,
    pub time: String,
}

/// How many rows `notifications` returns — the widget is a fixed-size
/// scrollable list, not a paginated one.
const NOTIFICATIONS_LIMIT: i64 = 20;

/// Comments on `viewer`'s own posts, written by somebody else, newest
/// first. Always "somebody commented" — comments here are flat (see
/// `Comment`, no `parent_comment_id`), so there is no separate "somebody
/// replied to your comment" case to distinguish from it. A viewer's own
/// comments on their own post are excluded by the `$ne`: there's nothing to
/// notify them of.
pub async fn notifications(db: &Database, viewer: &str) -> Result<Vec<NotificationView>> {
    let pipeline = vec![
        doc! { "$match": { "owner_id": viewer } },
        doc! { "$unwind": "$comments" },
        doc! { "$match": { "comments.author_id": { "$ne": viewer } } },
        doc! { "$sort": { "comments.created_at": -1 } },
        doc! { "$limit": NOTIFICATIONS_LIMIT },
        doc! { "$project": {
            "_id": 0,
            "id": "$comments.id",
            "author": "$comments.author",
            "post_title": "$title",
            "excerpt": "$comments.body",
            "time": "$comments.created_at",
        } },
    ];
    let cursor = posts(db).aggregate(pipeline).with_type::<NotificationView>().await?;
    collect(cursor).await
}

/// Loads the posts Lattice ships with, once, if the feed is empty.
///
/// Authored in `frontend/lib/posts/data.ts` and exported to JSON by
/// `npm run seed:posts` — TypeScript stays the source because that is
/// where the `Diagram` and `CanvasGraph` types they're built from live.
/// Guarded on the collection being empty rather than on a marker document:
/// the intent is "give a new install something to look at", and once
/// anybody has posted, that's already true.
pub async fn seed(db: &Database, seed_json: &str) -> Result<u64> {
    if posts(db).count_documents(doc! {}).await? > 0 {
        return Ok(0);
    }
    let seeded: Vec<Post> = match serde_json::from_str(seed_json) {
        Ok(posts) => posts,
        Err(e) => {
            tracing::warn!(error = %e, "could not read the seeded posts — the feed will start empty");
            return Ok(0);
        }
    };
    if seeded.is_empty() {
        return Ok(0);
    }
    let count = seeded.len() as u64;
    posts(db).insert_many(&seeded).await?;
    Ok(count)
}
