//! The Code-Canvas block vocabulary and graph model (BLUEPRINT.md §4.3).
//!
//! Mirrors `frontend/lib/code-canvas/graph.ts`. The frontend owns the
//! presentation half of a block (colour, width, which edge a handle sits
//! on); this owns the half that decides what a graph *means* — which kinds
//! exist, which handles they have, and which wires between them are legal.
//! `codegen` reads the same catalog, so a block that can't be compiled
//! can't be described here either.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Every block the canvas can produce. Serialized in lowercase, matching
/// the `NodeKind` union on the frontend — an unknown kind fails
/// deserialization, which is how a graph from a newer client gets rejected
/// with a 400 instead of being stored and silently mis-compiled later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Entry,
    List,
    Dlist,
    Tree,
    Graph,
    Array,
    Stack,
    Queue,
    Map,
    Var,
    Traverse,
    Insert,
    Search,
    Print,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Structure,
    Container,
    Operation,
}

#[derive(Debug, Clone, Copy)]
pub struct PortSpec {
    pub id: &'static str,
    /// Outputs only: may this handle feed more than one target at once? A
    /// `next` pointer has exactly one target; a vertex's `edges` handle has
    /// as many as you like.
    pub multi: bool,
}

const fn port(id: &'static str) -> PortSpec {
    PortSpec { id, multi: false }
}

const fn multi_port(id: &'static str) -> PortSpec {
    PortSpec { id, multi: true }
}

#[derive(Debug, Clone, Copy)]
pub struct NodeSpec {
    /// Human-readable name, used verbatim in the notes codegen returns.
    pub label: &'static str,
    pub category: Category,
    pub inputs: &'static [PortSpec],
    pub outputs: &'static [PortSpec],
}

// Operations take two kinds of wire: `data` is *what* to act on, `on` is
// the previous step in the sequence, and `then` hands off to the next one.
const OP_INPUTS: &[PortSpec] = &[port("data"), port("on")];
const OP_OUTPUTS: &[PortSpec] = &[port("then")];
const IN_ONLY: &[PortSpec] = &[port("in")];
const NO_PORTS: &[PortSpec] = &[];
const USE_OUT: &[PortSpec] = &[multi_port("use")];
// Each of these has to be a named const rather than an inline `&[...]` in
// the match arms below: a slice literal built from `const fn` calls inside
// a function body is a temporary, and `NodeSpec` holds `&'static` slices.
const ENTRY_OUT: &[PortSpec] = &[multi_port("target")];
const LIST_OUT: &[PortSpec] = &[port("next")];
const DLIST_OUT: &[PortSpec] = &[port("prev"), port("next")];
const TREE_OUT: &[PortSpec] = &[port("left"), port("right")];
const VERTEX_OUT: &[PortSpec] = &[multi_port("edges")];
const VAR_OUT: &[PortSpec] = &[multi_port("value")];

impl NodeKind {
    pub fn spec(self) -> NodeSpec {
        match self {
            // `target` is multi because one pointer both names the
            // structure *and* is what operations get wired to.
            NodeKind::Entry => NodeSpec {
                label: "Start pointer",
                category: Category::Structure,
                inputs: NO_PORTS,
                outputs: ENTRY_OUT,
            },
            NodeKind::List => NodeSpec {
                label: "List node",
                category: Category::Structure,
                inputs: IN_ONLY,
                outputs: LIST_OUT,
            },
            NodeKind::Dlist => NodeSpec {
                label: "Doubly node",
                category: Category::Structure,
                inputs: IN_ONLY,
                outputs: DLIST_OUT,
            },
            NodeKind::Tree => NodeSpec {
                label: "Tree node",
                category: Category::Structure,
                inputs: IN_ONLY,
                outputs: TREE_OUT,
            },
            NodeKind::Graph => NodeSpec {
                label: "Vertex",
                category: Category::Structure,
                inputs: IN_ONLY,
                outputs: VERTEX_OUT,
            },
            NodeKind::Array => NodeSpec {
                label: "Array",
                category: Category::Container,
                inputs: IN_ONLY,
                outputs: USE_OUT,
            },
            NodeKind::Stack => NodeSpec {
                label: "Stack",
                category: Category::Container,
                inputs: IN_ONLY,
                outputs: USE_OUT,
            },
            NodeKind::Queue => NodeSpec {
                label: "Queue",
                category: Category::Container,
                inputs: IN_ONLY,
                outputs: USE_OUT,
            },
            NodeKind::Map => NodeSpec {
                label: "Hash map",
                category: Category::Container,
                inputs: IN_ONLY,
                outputs: USE_OUT,
            },
            NodeKind::Var => NodeSpec {
                label: "Variable",
                category: Category::Container,
                inputs: NO_PORTS,
                outputs: VAR_OUT,
            },
            NodeKind::Traverse => NodeSpec {
                label: "Traverse",
                category: Category::Operation,
                inputs: OP_INPUTS,
                outputs: OP_OUTPUTS,
            },
            NodeKind::Insert => NodeSpec {
                label: "Insert",
                category: Category::Operation,
                inputs: OP_INPUTS,
                outputs: OP_OUTPUTS,
            },
            NodeKind::Search => NodeSpec {
                label: "Search",
                category: Category::Operation,
                inputs: OP_INPUTS,
                outputs: OP_OUTPUTS,
            },
            NodeKind::Print => NodeSpec {
                label: "Print",
                category: Category::Operation,
                inputs: OP_INPUTS,
                outputs: OP_OUTPUTS,
            },
        }
    }

    pub fn label(self) -> &'static str {
        self.spec().label
    }

    pub fn category(self) -> Category {
        self.spec().category
    }

    pub fn is_operation(self) -> bool {
        self.category() == Category::Operation
    }

    pub fn output(self, id: &str) -> Option<PortSpec> {
        self.spec().outputs.iter().copied().find(|p| p.id == id)
    }

    pub fn has_input(self, id: &str) -> bool {
        self.spec().inputs.iter().any(|p| p.id == id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasNode {
    pub id: String,
    pub kind: NodeKind,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub fields: HashMap<String, String>,
    /// Anything the client sent that isn't modelled here — kept so a
    /// round trip through the backend never quietly drops a property a
    /// newer frontend added.
    #[serde(flatten, default)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasEdge {
    pub id: String,
    pub from: String,
    #[serde(rename = "fromPort")]
    pub from_port: String,
    pub to: String,
    #[serde(rename = "toPort")]
    pub to_port: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CanvasGraph {
    #[serde(default)]
    pub nodes: Vec<CanvasNode>,
    #[serde(default)]
    pub edges: Vec<CanvasEdge>,
}

/// Ceilings on a stored graph. Generous next to any graph a person would
/// actually wire by hand, low enough that a scripted client can't turn the
/// canvas into an unbounded write target — the same reasoning as
/// `MAX_SOURCE_BYTES` on `/api/execute`.
pub const MAX_NODES: usize = 400;
pub const MAX_EDGES: usize = 1200;
pub const MAX_FIELD_BYTES: usize = 4 * 1024;

impl CanvasGraph {
    pub fn node(&self, id: &str) -> Option<&CanvasNode> {
        self.nodes.iter().find(|n| n.id == id)
    }

    /// Structural validation, run before a graph is stored and again
    /// before it is compiled.
    ///
    /// Deliberately *structural* only — it checks that the graph is
    /// describable (handles exist, endpoints exist, single-connection
    /// handles are single), not that it is meaningful. "Traverse isn't
    /// wired to anything" is a note from codegen, not an error: half-built
    /// graphs are the normal state of a canvas somebody is still working
    /// on, and refusing to save one would be hostile.
    pub fn validate(&self) -> Result<(), String> {
        if self.nodes.len() > MAX_NODES {
            return Err(format!("too many blocks: {} (limit {MAX_NODES})", self.nodes.len()));
        }
        if self.edges.len() > MAX_EDGES {
            return Err(format!("too many wires: {} (limit {MAX_EDGES})", self.edges.len()));
        }

        let mut seen_nodes = std::collections::HashSet::new();
        for node in &self.nodes {
            if node.id.is_empty() {
                return Err("a block has an empty id".to_string());
            }
            if !seen_nodes.insert(node.id.as_str()) {
                return Err(format!("duplicate block id {:?}", node.id));
            }
            for (key, value) in &node.fields {
                if value.len() > MAX_FIELD_BYTES {
                    return Err(format!(
                        "block {:?} field {key:?} exceeds the {MAX_FIELD_BYTES}-byte limit",
                        node.id
                    ));
                }
            }
        }

        let mut seen_edges = std::collections::HashSet::new();
        // One entry per single-connection output handle already spoken for.
        let mut claimed = std::collections::HashSet::new();
        for edge in &self.edges {
            if !seen_edges.insert(edge.id.as_str()) {
                return Err(format!("duplicate wire id {:?}", edge.id));
            }
            let from = self
                .node(&edge.from)
                .ok_or_else(|| format!("wire {:?} starts at a block that doesn't exist", edge.id))?;
            let to = self
                .node(&edge.to)
                .ok_or_else(|| format!("wire {:?} ends at a block that doesn't exist", edge.id))?;
            if edge.from == edge.to {
                return Err(format!("wire {:?} connects a block to itself", edge.id));
            }
            let Some(out_port) = from.kind.output(&edge.from_port) else {
                return Err(format!(
                    "{} has no {:?} handle",
                    from.kind.label(),
                    edge.from_port
                ));
            };
            if !to.kind.has_input(&edge.to_port) {
                return Err(format!("{} has no {:?} handle", to.kind.label(), edge.to_port));
            }
            if !out_port.multi && !claimed.insert((edge.from.as_str(), edge.from_port.as_str())) {
                return Err(format!(
                    "{}'s {:?} handle takes a single connection but has more than one",
                    from.kind.label(),
                    edge.from_port
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: serde_json::Value) -> Result<CanvasGraph, serde_json::Error> {
        serde_json::from_value(json)
    }

    fn node(id: &str, kind: &str) -> serde_json::Value {
        serde_json::json!({ "id": id, "kind": kind, "x": 0.0, "y": 0.0, "fields": {} })
    }

    fn edge(id: &str, from: &str, from_port: &str, to: &str, to_port: &str) -> serde_json::Value {
        serde_json::json!({ "id": id, "from": from, "fromPort": from_port, "to": to, "toPort": to_port })
    }

    /// A graph from a newer client naming a block this build doesn't know
    /// fails at the door rather than being stored and mis-compiled later.
    #[test]
    fn an_unknown_block_kind_is_rejected() {
        let result = parse(serde_json::json!({
            "nodes": [node("a", "quantum_heap")],
            "edges": []
        }));
        assert!(result.is_err());
    }

    #[test]
    fn a_wire_to_a_missing_block_is_rejected() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "list")],
            "edges": [edge("e", "a", "next", "ghost", "in")]
        }))
        .unwrap();
        assert!(g.validate().unwrap_err().contains("doesn't exist"));
    }

    #[test]
    fn a_wire_to_a_handle_that_does_not_exist_is_rejected() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "list"), node("b", "list")],
            "edges": [edge("e", "a", "left", "b", "in")]
        }))
        .unwrap();
        assert!(g.validate().unwrap_err().contains("no \"left\" handle"));
    }

    /// A `next` pointer has exactly one target. The editor enforces this by
    /// replacing the old wire; a client that doesn't gets a 400.
    #[test]
    fn a_single_connection_handle_cannot_take_two_wires() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "list"), node("b", "list"), node("c", "list")],
            "edges": [
                edge("e1", "a", "next", "b", "in"),
                edge("e2", "a", "next", "c", "in")
            ]
        }))
        .unwrap();
        assert!(g.validate().unwrap_err().contains("single connection"));
    }

    #[test]
    fn a_multi_handle_takes_as_many_wires_as_it_likes() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "graph"), node("b", "graph"), node("c", "graph")],
            "edges": [
                edge("e1", "a", "edges", "b", "in"),
                edge("e2", "a", "edges", "c", "in")
            ]
        }))
        .unwrap();
        assert!(g.validate().is_ok());
    }

    #[test]
    fn a_block_cannot_wire_to_itself() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "list")],
            "edges": [edge("e", "a", "next", "a", "in")]
        }))
        .unwrap();
        assert!(g.validate().unwrap_err().contains("itself"));
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let g = parse(serde_json::json!({
            "nodes": [node("a", "list"), node("a", "tree")],
            "edges": []
        }))
        .unwrap();
        assert!(g.validate().unwrap_err().contains("duplicate block id"));
    }

    /// Validation is structural, not semantic. A canvas somebody is still
    /// building is full of blocks wired to nothing, and refusing to save
    /// that would make the editor unusable — codegen reports it as a note
    /// instead.
    #[test]
    fn a_half_built_graph_is_valid() {
        let g = parse(serde_json::json!({
            "nodes": [node("t", "traverse"), node("h", "entry"), node("a", "array")],
            "edges": []
        }))
        .unwrap();
        assert!(g.validate().is_ok());
    }

    /// Properties this build doesn't model survive a round trip, so a
    /// newer frontend can't lose data by saving through an older backend.
    #[test]
    fn unmodelled_node_properties_survive_a_round_trip() {
        let g = parse(serde_json::json!({
            "nodes": [{
                "id": "a", "kind": "list", "x": 1.0, "y": 2.0,
                "fields": { "value": "5" },
                "collapsed": true
            }],
            "edges": []
        }))
        .unwrap();
        let out = serde_json::to_value(&g).unwrap();
        assert_eq!(out["nodes"][0]["collapsed"], serde_json::json!(true));
    }
}
