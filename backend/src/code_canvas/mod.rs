//! Code-Canvas node graphs, stored in MongoDB (§ crate::mongo).
//!
//! The graph is stored as an opaque document. Nothing here inspects a
//! node or a wire: the block vocabulary and the rules about which
//! connections are legal live in `frontend/lib/code-canvas/graph.ts`, and
//! so does the compiler that turns a graph into C++. This backend's job is
//! to hold the document the editor sends and hand it back unchanged —
//! which is exactly the shape a document store is for, and means a new
//! block kind needs no change on this side at all.
//!
//! `visualize` is the one place that does more: it takes the C++ the
//! client compiled and pushes it into the graph's linked Visualizer
//! canvas, so the two stay in step.

use crate::mongo;
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::ReturnDocument;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

use crate::canvases::{collect, Result};

fn graphs(db: &Database) -> Collection<CodeCanvas> {
    mongo::collection(db, mongo::CODE_CANVASES)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeCanvas {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    /// The full node/edge graph as the canvas sends it. Stored whole
    /// rather than shredded into node and edge collections: nothing
    /// queries *into* a graph, it is always read and written as one
    /// document, so keeping it intact means the editor's own model is the
    /// storage format.
    pub graph: Document,
    pub created_at: String,
    pub updated_at: String,
}

/// Row for the graph switcher: counts, no graph payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeCanvasSummary {
    pub id: String,
    pub name: String,
    pub node_count: i64,
    pub edge_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct CodeCanvasPatch {
    pub name: Option<String>,
    pub graph: Option<Document>,
}

/// An empty graph, for a canvas created without one.
fn empty_graph() -> Document {
    doc! { "nodes": [], "edges": [] }
}

pub async fn list(db: &Database, owner_id: &str) -> Result<Vec<CodeCanvasSummary>> {
    // The counts are computed server-side rather than by shipping every
    // graph to the client and measuring it — a switcher listing twenty
    // graphs would otherwise transfer twenty full node/edge documents to
    // render twenty short lines of text.
    let cursor = mongo::collection::<CodeCanvasSummary>(db, mongo::CODE_CANVASES)
        .find(doc! { "owner_id": owner_id })
        .projection(doc! {
            "id": 1,
            "name": 1,
            "updated_at": 1,
            "node_count": { "$size": { "$ifNull": ["$graph.nodes", []] } },
            "edge_count": { "$size": { "$ifNull": ["$graph.edges", []] } },
        })
        .sort(doc! { "updated_at": -1 })
        .await?;
    collect(cursor).await
}

pub async fn create(
    db: &Database,
    owner_id: &str,
    name: &str,
    graph: Option<Document>,
) -> Result<CodeCanvas> {
    let timestamp = mongo::now();
    let canvas = CodeCanvas {
        id: uuid::Uuid::new_v4().to_string(),
        owner_id: owner_id.to_string(),
        name: name.to_string(),
        graph: graph.unwrap_or_else(empty_graph),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    graphs(db).insert_one(&canvas).await?;
    Ok(canvas)
}

pub async fn get(db: &Database, owner_id: &str, id: &str) -> Result<Option<CodeCanvas>> {
    graphs(db).find_one(doc! { "id": id, "owner_id": owner_id }).await
}

pub async fn update(
    db: &Database,
    owner_id: &str,
    id: &str,
    patch: &CodeCanvasPatch,
) -> Result<Option<CodeCanvas>> {
    let mut set = Document::new();
    if let Some(name) = &patch.name {
        set.insert("name", name);
    }
    if let Some(graph) = &patch.graph {
        set.insert("graph", graph);
    }
    if set.is_empty() {
        return get(db, owner_id, id).await;
    }
    set.insert("updated_at", mongo::now());

    graphs(db)
        .find_one_and_update(doc! { "id": id, "owner_id": owner_id }, doc! { "$set": set })
        .return_document(ReturnDocument::After)
        .await
}

pub async fn delete(db: &Database, owner_id: &str, id: &str) -> Result<bool> {
    let result = graphs(db)
        .delete_one(doc! { "id": id, "owner_id": owner_id })
        .await?;
    if result.deleted_count > 0 {
        // Detach rather than cascade — see `canvases::unlink_generated`.
        crate::canvases::unlink_generated(db, owner_id, id).await?;
    }
    Ok(result.deleted_count > 0)
}

/// What `visualize` did, so the handler can answer 200 vs 201 honestly and
/// the frontend can tell "here's your canvas again" from "here's a new
/// one".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VisualizeOutcome {
    Created,
    Refreshed,
    /// The graph compiled to exactly what the linked canvas already holds,
    /// so nothing was written — including the resume step, which is still
    /// valid for source that didn't move.
    Unchanged,
}

impl VisualizeOutcome {
    fn from_str(value: &str) -> Self {
        match value {
            "created" => Self::Created,
            "refreshed" => Self::Refreshed,
            _ => Self::Unchanged,
        }
    }
}

pub struct Visualized {
    pub canvas_id: String,
    pub outcome: VisualizeOutcome,
}

/// Pushes compiled source into the graph's linked Visualizer canvas.
///
/// The C++ arrives from the client rather than being generated here: the
/// compiler lives in `frontend/lib/code-canvas/codegen.ts`, where it also
/// drives the live code pane, so there is exactly one implementation and
/// what you watch being built is what runs. The graph is still read back
/// from the database first — the canvas is named after the *stored* graph,
/// not after whatever a stale tab thinks it is called.
pub async fn visualize(
    db: &Database,
    owner_id: &str,
    id: &str,
    source: &str,
) -> Result<Option<Visualized>> {
    let Some(graph) = get(db, owner_id, id).await? else {
        return Ok(None);
    };
    let (canvas, outcome) =
        crate::canvases::upsert_generated(db, owner_id, &graph.id, &graph.name, source).await?;
    Ok(Some(Visualized {
        canvas_id: canvas.id,
        outcome: VisualizeOutcome::from_str(outcome),
    }))
}

/// Rejects anything that isn't a `{nodes: [...], edges: [...]}` document.
///
/// Deliberately shallow — the real rules about which wires are legal are
/// the frontend's (see this module's header) and duplicating them here
/// would mean two vocabularies to keep in step. This exists only so a
/// malformed body can't be stored as a "graph" that later loads as a blank
/// canvas with no explanation.
pub fn validate(graph: &Document) -> std::result::Result<(), String> {
    for key in ["nodes", "edges"] {
        match graph.get(key) {
            Some(Bson::Array(_)) => {}
            _ => return Err(format!("this graph isn't one Lattice understands: `{key}` must be a list")),
        }
    }
    Ok(())
}
