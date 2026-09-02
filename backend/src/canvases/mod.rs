//! Visualizer workspaces, stored in MongoDB (§ crate::mongo).
//!
//! One canvas is one current snapshot — the code you typed, its language,
//! and where you were reading — not a history of many runs. A run's trace,
//! stdout and compiler output are still not stored anywhere: the sandbox
//! recomputes them and streams them to the client. What's here is what
//! can't be recomputed.
//!
//! `owner_id` is the Clerk `sub` claim, so scoping every query by it is
//! what stops one user reading another's canvas. A canvas that exists but
//! isn't the caller's is answered exactly like one that doesn't exist.

use crate::mongo;
use mongodb::bson::{doc, Document};
use mongodb::options::ReturnDocument;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

pub type Result<T> = mongodb::error::Result<T>;

fn canvases(db: &Database) -> Collection<Canvas> {
    mongo::collection(db, mongo::CANVASES)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Canvas {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub language: String,
    pub source_code: String,
    pub step_index: i32,
    /// `"user"` for a canvas somebody opened and typed into,
    /// `"code_canvas"` for one Lattice generated from a graph. Permanent:
    /// it records where this canvas came from, and survives the graph
    /// being deleted.
    pub origin: String,
    /// The graph this canvas was generated from, or `None` for a
    /// hand-written one — and also for a generated one whose graph has
    /// since been deleted. While this is `Some` the source is derived and
    /// therefore read-only; once it's `None` there is nothing left to
    /// desync from, so editing is allowed again.
    pub code_canvas_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Lightweight row for the canvases quick-switcher — no source payload,
/// just enough to render and sort the list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSummary {
    pub id: String,
    pub name: String,
    pub language: String,
    pub updated_at: String,
    pub origin: String,
    pub code_canvas_id: Option<String>,
}

/// `PATCH /api/canvases/{id}` body — every field optional, `None` meaning
/// "leave unchanged".
#[derive(Debug, Default, Deserialize)]
pub struct CanvasPatch {
    pub name: Option<String>,
    pub language: Option<String>,
    pub source_code: Option<String>,
    pub step_index: Option<i32>,
}

pub async fn list(db: &Database, owner_id: &str) -> Result<Vec<CanvasSummary>> {
    let cursor = mongo::collection::<CanvasSummary>(db, mongo::CANVASES)
        .find(doc! { "owner_id": owner_id })
        .projection(doc! { "id": 1, "name": 1, "language": 1, "updated_at": 1, "origin": 1, "code_canvas_id": 1 })
        .sort(doc! { "updated_at": -1 })
        .await?;
    collect(cursor).await
}

pub async fn create(db: &Database, owner_id: &str, name: &str, language: &str) -> Result<Canvas> {
    let timestamp = mongo::now();
    let canvas = Canvas {
        id: uuid::Uuid::new_v4().to_string(),
        owner_id: owner_id.to_string(),
        name: name.to_string(),
        language: language.to_string(),
        source_code: String::new(),
        step_index: 0,
        origin: "user".to_string(),
        code_canvas_id: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    canvases(db).insert_one(&canvas).await?;
    Ok(canvas)
}

pub async fn get(db: &Database, owner_id: &str, id: &str) -> Result<Option<Canvas>> {
    canvases(db).find_one(doc! { "id": id, "owner_id": owner_id }).await
}

/// Outcome of a `PATCH /api/canvases/{id}` — three cases the handler has
/// to answer differently, so they're modelled rather than squeezed into
/// `Option<Canvas>`.
pub enum UpdateOutcome {
    Updated(Box<Canvas>),
    NotFound,
    /// The patch tried to change generated source on a canvas still linked
    /// to the graph that produced it.
    ReadOnly,
}

pub async fn update(
    db: &Database,
    owner_id: &str,
    id: &str,
    patch: &CanvasPatch,
) -> Result<UpdateOutcome> {
    let mut set = Document::new();
    if let Some(name) = &patch.name {
        set.insert("name", name);
    }
    if let Some(language) = &patch.language {
        set.insert("language", language);
    }
    if let Some(source) = &patch.source_code {
        set.insert("source_code", source);
    }
    if let Some(step) = patch.step_index {
        set.insert("step_index", step);
    }
    if set.is_empty() {
        // An empty patch is a read, not an error — and it must not bump
        // `updated_at`, or the quick-switcher's ordering would shuffle
        // every time a page merely loaded.
        return Ok(match get(db, owner_id, id).await? {
            Some(canvas) => UpdateOutcome::Updated(Box::new(canvas)),
            None => UpdateOutcome::NotFound,
        });
    }
    set.insert("updated_at", mongo::now());

    // A generated canvas's source and language belong to its graph — the
    // only legitimate way to change them is to re-generate from the
    // Code-Canvas page. Name and step_index stay editable: renaming a
    // canvas and remembering where you were reading are both about *this*
    // canvas, not about the code in it.
    //
    // The guard rides in the filter rather than being a read-then-write,
    // so the check and the update are one atomic operation and a
    // concurrent Visualize can't slip between them.
    let restricted = patch.source_code.is_some() || patch.language.is_some();
    let mut filter = doc! { "id": id, "owner_id": owner_id };
    if restricted {
        filter.insert("code_canvas_id", mongodb::bson::Bson::Null);
    }

    let updated = canvases(db)
        .find_one_and_update(filter, doc! { "$set": set })
        .return_document(ReturnDocument::After)
        .await?;

    match updated {
        Some(canvas) => Ok(UpdateOutcome::Updated(Box::new(canvas))),
        // The filter matched nothing. With the extra clause that's either
        // "no such canvas" or "it's linked" — distinguished here so the
        // handler can answer 404 or 409 honestly rather than guessing.
        None if restricted => Ok(match get(db, owner_id, id).await? {
            Some(_) => UpdateOutcome::ReadOnly,
            None => UpdateOutcome::NotFound,
        }),
        None => Ok(UpdateOutcome::NotFound),
    }
}

pub async fn delete(db: &Database, owner_id: &str, id: &str) -> Result<bool> {
    let result = canvases(db)
        .delete_one(doc! { "id": id, "owner_id": owner_id })
        .await?;
    Ok(result.deleted_count > 0)
}

/// Compiles a graph into its linked canvas, creating that canvas the first
/// time. A graph has at most one derived canvas (enforced by the partial
/// unique index in `mongo::ensure_indexes`), so pressing Visualize
/// repeatedly refreshes one canvas instead of littering the Visualizer.
pub async fn upsert_generated(
    db: &Database,
    owner_id: &str,
    code_canvas_id: &str,
    name: &str,
    source: &str,
) -> Result<(Canvas, &'static str)> {
    let existing = canvases(db)
        .find_one(doc! { "code_canvas_id": code_canvas_id, "owner_id": owner_id })
        .await?;

    let Some(existing) = existing else {
        let timestamp = mongo::now();
        let canvas = Canvas {
            id: uuid::Uuid::new_v4().to_string(),
            owner_id: owner_id.to_string(),
            name: name.to_string(),
            language: "cpp".to_string(),
            source_code: source.to_string(),
            step_index: 0,
            origin: "code_canvas".to_string(),
            code_canvas_id: Some(code_canvas_id.to_string()),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        canvases(db).insert_one(&canvas).await?;
        return Ok((canvas, "created"));
    };

    // Identical source is left completely alone, resume step included —
    // pressing Visualize on an unchanged graph shouldn't scroll the reader
    // back to step 0.
    if existing.source_code == source {
        return Ok((existing, "unchanged"));
    }

    // `name` is deliberately not refreshed: it is seeded from the graph
    // when the canvas is created, but renaming a canvas is something the
    // user did to *that canvas*, and a later Visualize shouldn't silently
    // undo it.
    let refreshed = canvases(db)
        .find_one_and_update(
            doc! { "id": &existing.id, "owner_id": owner_id },
            doc! { "$set": { "source_code": source, "step_index": 0, "updated_at": mongo::now() } },
        )
        .return_document(ReturnDocument::After)
        .await?
        .unwrap_or(existing);
    Ok((refreshed, "refreshed"))
}

/// Detaches the canvases derived from a graph that's being deleted.
///
/// Set-to-null rather than delete: losing a graph shouldn't take the
/// canvas it produced with it. Such a canvas keeps `origin: "code_canvas"`
/// — the provenance mark is permanent — but, with no graph left to desync
/// from, becomes editable again.
pub async fn unlink_generated(db: &Database, owner_id: &str, code_canvas_id: &str) -> Result<()> {
    canvases(db)
        .update_many(
            doc! { "code_canvas_id": code_canvas_id, "owner_id": owner_id },
            doc! { "$set": { "code_canvas_id": null, "updated_at": mongo::now() } },
        )
        .await?;
    Ok(())
}

/// The stored source of a canvas whose code is generated, or `None` when
/// the canvas is hand-written, missing, or not the caller's.
pub async fn generated_source(db: &Database, owner_id: &str, id: &str) -> Result<Option<String>> {
    Ok(canvases(db)
        .find_one(doc! { "id": id, "owner_id": owner_id, "code_canvas_id": { "$type": "string" } })
        .await?
        .map(|c| c.source_code))
}

/// Drains a cursor into a Vec. Shared by every `list` in this crate — the
/// driver's own `TryStreamExt::try_collect` needs a type annotation at
/// each call site, and this is that annotation written once.
pub async fn collect<T>(mut cursor: mongodb::Cursor<T>) -> Result<Vec<T>>
where
    T: for<'de> Deserialize<'de> + Send + Sync + Unpin,
{
    let mut rows = Vec::new();
    while cursor.advance().await? {
        rows.push(cursor.deserialize_current()?);
    }
    Ok(rows)
}
