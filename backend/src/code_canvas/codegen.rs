//! Code-Canvas graph → C++ source.
//!
//! The authoritative compiler for a graph: whatever gets stored, compiled
//! and traced comes from here. `frontend/lib/code-canvas/codegen.ts` is a
//! port of this same algorithm kept for the live preview in the code pane
//! (which has to update on every keystroke without a round trip) — the two
//! must emit identical text, so a change to one is a change to both.
//!
//! Structure of the emitted program:
//!   includes → structs → helpers → main { allocate, wire, name, operate }
//!
//! Allocating every node *before* wiring any of them is what makes cyclic
//! graphs — a list looping back on itself, a general digraph — emit valid
//! code for free.

use super::graph::{CanvasEdge, CanvasGraph, CanvasNode, NodeKind};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
pub struct GeneratedCode {
    pub source: String,
    /// Parts of the graph that couldn't be compiled — an unwired
    /// operation, a connection C++ can't express. Surfaced to the user
    /// rather than swallowed; never an error, because a half-built graph
    /// is the normal state of a canvas somebody is still working on.
    pub notes: Vec<String>,
}

const EMPTY_PROGRAM: &str = r#"// Nothing on the canvas yet.
//
// Drag a node out of the palette on the left, wire a few together,
// and the code for that structure appears here as you build.

int main() {
    return 0;
}
"#;

const STRUCT_LIST: &str = r#"struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};"#;

const STRUCT_DLIST: &str = r#"struct DNode {
    int val;
    DNode* prev;
    DNode* next;
    DNode(int v) : val(v), prev(nullptr), next(nullptr) {}
};"#;

const STRUCT_TREE: &str = r#"struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
};"#;

const HELPER_LIST_APPEND: &str = r#"Node* listAppend(Node* head, int v) {
    Node* fresh = new Node(v);
    if (!head) return fresh;
    Node* cur = head;
    while (cur->next) cur = cur->next;
    cur->next = fresh;
    return head;
}"#;

const HELPER_DLIST_APPEND: &str = r#"DNode* dlistAppend(DNode* head, int v) {
    DNode* fresh = new DNode(v);
    if (!head) return fresh;
    DNode* cur = head;
    while (cur->next) cur = cur->next;
    cur->next = fresh;
    fresh->prev = cur;
    return head;
}"#;

const HELPER_PRINT_INORDER: &str = r#"void printInorder(TreeNode* n) {
    if (!n) return;
    printInorder(n->left);
    printf("%d ", n->val);
    printInorder(n->right);
}"#;

const HELPER_BST_INSERT: &str = r#"TreeNode* bstInsert(TreeNode* root, int v) {
    if (!root) return new TreeNode(v);
    if (v < root->val) root->left = bstInsert(root->left, v);
    else if (v > root->val) root->right = bstInsert(root->right, v);
    return root;
}"#;

const HELPER_BST_CONTAINS: &str = r#"bool bstContains(TreeNode* root, int v) {
    while (root) {
        if (root->val == v) return true;
        root = v < root->val ? root->left : root->right;
    }
    return false;
}"#;

const HELPER_BFS: &str = r#"void bfs(const std::vector<std::vector<int>>& adj,
         const std::vector<std::string>& names, int start) {
    std::vector<bool> seen(adj.size(), false);
    std::queue<int> pending;
    seen[start] = true;
    pending.push(start);
    while (!pending.empty()) {
        int at = pending.front();
        pending.pop();
        printf("%s ", names[at].c_str());
        for (int next : adj[at]) {
            if (!seen[next]) { seen[next] = true; pending.push(next); }
        }
    }
    printf("\n");
}"#;

/// Emission order for helpers, so the output doesn't depend on which
/// operation happened to need one first.
const HELPER_ORDER: &[(&str, &str)] = &[
    ("listAppend", HELPER_LIST_APPEND),
    ("dlistAppend", HELPER_DLIST_APPEND),
    ("printInorder", HELPER_PRINT_INORDER),
    ("bstInsert", HELPER_BST_INSERT),
    ("bstContains", HELPER_BST_CONTAINS),
    ("bfs", HELPER_BFS),
];

/// The C++ pointer type for the kinds that are heap nodes. `None` for
/// everything else, which is also the test for "is this a pointer-shaped
/// structure" throughout.
fn pointer_type(kind: NodeKind) -> Option<&'static str> {
    match kind {
        NodeKind::List => Some("Node*"),
        NodeKind::Dlist => Some("DNode*"),
        NodeKind::Tree => Some("TreeNode*"),
        _ => None,
    }
}

/// A valid C identifier from whatever the user typed, falling back when
/// there's nothing usable left.
fn sanitize(raw: &str, fallback: &str) -> String {
    let mut out: String = raw
        .trim()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    if out.starts_with(|c: char| c.is_ascii_digit()) {
        out.insert(0, '_');
    }
    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

/// JavaScript's `Number.parseInt` semantics, which the frontend preview
/// uses: leading sign, then as many digits as there are, ignoring any
/// trailing garbage; anything else is the fallback. Ported rather than
/// using Rust's stricter `str::parse` precisely so both sides agree on
/// what `"12abc"` means.
fn parse_int_prefix(raw: &str) -> Option<i64> {
    let text = raw.trim();
    let mut chars = text.chars().peekable();
    let mut digits = String::new();
    if let Some(&sign @ ('+' | '-')) = chars.peek() {
        digits.push(sign);
        chars.next();
    }
    while let Some(&c) = chars.peek() {
        if !c.is_ascii_digit() {
            break;
        }
        digits.push(c);
        chars.next();
    }
    if digits.is_empty() || digits == "+" || digits == "-" {
        return None;
    }
    digits.parse::<i64>().ok()
}

fn int_field(node: &CanvasNode, id: &str) -> i64 {
    node.fields.get(id).and_then(|v| parse_int_prefix(v)).unwrap_or(0)
}

/// Comma- or newline-separated entries, trimmed, blanks dropped.
fn list_field(node: &CanvasNode, id: &str) -> Vec<String> {
    node.fields
        .get(id)
        .map(|raw| {
            raw.split([',', '\n'])
                .map(|part| part.trim().to_string())
                .filter(|part| !part.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Escapes for embedding inside a C++ string literal.
fn c_string(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('"', "\\\"")
}

fn field<'a>(node: &'a CanvasNode, id: &str) -> &'a str {
    node.fields.get(id).map(String::as_str).unwrap_or("")
}

/// Assigns every node a unique C++ identifier. Start pointers and
/// variables keep the name the user typed — that is the whole point of
/// those blocks — so they are claimed first and a generated name can never
/// steal one.
fn name_nodes(graph: &CanvasGraph, targets: &HashMap<String, String>) -> HashMap<String, String> {
    let mut names: HashMap<String, String> = HashMap::new();
    let mut used: HashSet<String> = HashSet::new();
    let mut counters: HashMap<&'static str, usize> = HashMap::new();

    let claim = |base: String, used: &mut HashSet<String>| -> String {
        let mut candidate = base.clone();
        let mut suffix = 2;
        while used.contains(&candidate) {
            candidate = format!("{base}{suffix}");
            suffix += 1;
        }
        used.insert(candidate.clone());
        candidate
    };

    for node in &graph.nodes {
        match node.kind {
            NodeKind::Entry => {
                let target_kind = targets
                    .get(&node.id)
                    .and_then(|id| graph.node(id))
                    .map(|n| n.kind);
                let fallback = match target_kind {
                    Some(NodeKind::Tree) => "root",
                    Some(NodeKind::Graph) => "start",
                    _ => "head",
                };
                let base = sanitize(field(node, "name"), fallback);
                let name = claim(base, &mut used);
                names.insert(node.id.clone(), name);
            }
            NodeKind::Var => {
                let base = sanitize(field(node, "name"), "value");
                let name = claim(base, &mut used);
                names.insert(node.id.clone(), name);
            }
            _ => {}
        }
    }

    for node in &graph.nodes {
        if names.contains_key(&node.id) {
            continue;
        }
        let prefix = match node.kind {
            NodeKind::List => "n",
            NodeKind::Dlist => "d",
            NodeKind::Tree => "t",
            NodeKind::Graph => "v",
            NodeKind::Array => "arr",
            NodeKind::Stack => "st",
            NodeKind::Queue => "q",
            NodeKind::Map => "m",
            _ => continue,
        };
        let next = counters.entry(prefix).or_insert(0);
        *next += 1;
        let base = format!("{prefix}{next}");
        let name = claim(base, &mut used);
        names.insert(node.id.clone(), name);
    }

    names
}

/// Operations run in wiring order: each chain starts at an operation whose
/// `on` handle is empty, then follows `then` links. Operations in no chain
/// still run, appended in canvas order, so a lone block isn't silently
/// ignored.
fn operation_order<'a>(ops: &[&'a CanvasNode], edges: &[CanvasEdge]) -> Vec<&'a CanvasNode> {
    let by_id: HashMap<&str, &CanvasNode> = ops.iter().map(|n| (n.id.as_str(), *n)).collect();
    let mut next_of: HashMap<&str, &str> = HashMap::new();
    let mut chained: HashSet<&str> = HashSet::new();
    for edge in edges {
        if edge.from_port != "then" || edge.to_port != "on" {
            continue;
        }
        if !by_id.contains_key(edge.from.as_str()) || !by_id.contains_key(edge.to.as_str()) {
            continue;
        }
        next_of.entry(edge.from.as_str()).or_insert(edge.to.as_str());
        chained.insert(edge.to.as_str());
    }

    let mut ordered: Vec<&CanvasNode> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    let walk = |start: &'a CanvasNode, ordered: &mut Vec<&'a CanvasNode>, seen: &mut HashSet<&'a str>| {
        let mut current = Some(start);
        while let Some(node) = current {
            if seen.contains(node.id.as_str()) {
                break;
            }
            seen.insert(node.id.as_str());
            ordered.push(node);
            current = next_of.get(node.id.as_str()).and_then(|id| by_id.get(id)).copied();
        }
    };
    for op in ops {
        if !chained.contains(op.id.as_str()) {
            walk(op, &mut ordered, &mut seen);
        }
    }
    for op in ops {
        if !seen.contains(op.id.as_str()) {
            walk(op, &mut ordered, &mut seen);
        }
    }
    ordered
}

/// Wraps a multi-statement operation in its own scope, so two of the same
/// operation can't collide over a local name.
fn block(lines: &[String]) -> String {
    let mut out = String::from("{\n");
    for line in lines {
        out.push_str("    ");
        out.push_str(line);
        out.push('\n');
    }
    out.push('}');
    out
}

/// What an operation acts on, resolved through a start pointer when there
/// is one — so a traverse wired to `head` walks from the head, not from
/// whichever cell happens to sit under the cursor.
struct Subject {
    name: String,
    kind: NodeKind,
    /// True when reached through a start pointer, which is what makes an
    /// insert able to reassign the head (`head = listAppend(head, v)`).
    via_pointer: bool,
}

pub fn generate(graph: &CanvasGraph) -> GeneratedCode {
    if graph.nodes.is_empty() {
        return GeneratedCode { source: EMPTY_PROGRAM.to_string(), notes: Vec::new() };
    }

    let mut notes: Vec<String> = Vec::new();
    let mut includes: BTreeSet<&'static str> = BTreeSet::new();
    includes.insert("<cstdio>");
    let mut helpers: HashSet<&'static str> = HashSet::new();
    let mut structs: HashSet<NodeKind> = HashSet::new();

    // A start pointer's `target` handle also feeds operations, so the
    // structure it names is the first non-operation it points at.
    let mut targets: HashMap<String, String> = HashMap::new();
    for node in graph.nodes.iter().filter(|n| n.kind == NodeKind::Entry) {
        for edge in &graph.edges {
            if edge.from != node.id || edge.from_port != "target" {
                continue;
            }
            if let Some(target) = graph.node(&edge.to)
                && !target.kind.is_operation()
            {
                targets.insert(node.id.clone(), target.id.clone());
                break;
            }
        }
    }

    let names = name_nodes(graph, &targets);
    let name_of = |node: &CanvasNode| -> String {
        names.get(&node.id).cloned().unwrap_or_else(|| node.id.clone())
    };

    let vertices: Vec<&CanvasNode> = graph.nodes.iter().filter(|n| n.kind == NodeKind::Graph).collect();
    let vertex_index: HashMap<&str, usize> =
        vertices.iter().enumerate().map(|(i, n)| (n.id.as_str(), i)).collect();

    let mut allocations: Vec<String> = Vec::new();
    let mut wiring: Vec<String> = Vec::new();
    let mut pointers: Vec<String> = Vec::new();
    let mut operations: Vec<String> = Vec::new();

    /* ---------------- allocate ---------------- */

    for node in &graph.nodes {
        let name = name_of(node);
        match node.kind {
            NodeKind::List | NodeKind::Dlist | NodeKind::Tree => {
                structs.insert(node.kind);
                let ty = pointer_type(node.kind).expect("pointer kinds have a pointer type");
                let bare = &ty[..ty.len() - 1];
                allocations.push(format!("{ty} {name} = new {bare}({});", int_field(node, "value")));
            }
            NodeKind::Array => {
                includes.insert("<vector>");
                let items: Vec<String> = list_field(node, "items")
                    .iter()
                    .map(|v| parse_int_prefix(v).unwrap_or(0).to_string())
                    .collect();
                allocations.push(format!("std::vector<int> {name} = {{{}}};", items.join(", ")));
            }
            NodeKind::Stack | NodeKind::Queue => {
                let (include, ty) = if node.kind == NodeKind::Stack {
                    ("<stack>", "stack")
                } else {
                    ("<queue>", "queue")
                };
                includes.insert(include);
                allocations.push(format!("std::{ty}<int> {name};"));
                for item in list_field(node, "items") {
                    allocations.push(format!("{name}.push({});", parse_int_prefix(&item).unwrap_or(0)));
                }
            }
            NodeKind::Map => {
                includes.insert("<unordered_map>");
                includes.insert("<string>");
                allocations.push(format!("std::unordered_map<std::string, int> {name};"));
                for entry in list_field(node, "entries") {
                    let (key, raw_value) = match entry.split_once(':') {
                        Some((key, value)) => (key, value),
                        None => (entry.as_str(), "0"),
                    };
                    allocations.push(format!(
                        "{name}[\"{}\"] = {};",
                        c_string(key.trim()),
                        parse_int_prefix(raw_value).unwrap_or(0)
                    ));
                }
            }
            NodeKind::Var => {
                allocations.push(format!("int {name} = {};", int_field(node, "value")));
            }
            _ => {}
        }
    }

    if !vertices.is_empty() {
        includes.insert("<vector>");
        includes.insert("<string>");
        let labels: Vec<String> = vertices
            .iter()
            .enumerate()
            .map(|(i, v)| {
                let label = field(v, "value").trim();
                let label = if label.is_empty() { format!("v{i}") } else { label.to_string() };
                format!("\"{}\"", c_string(&label))
            })
            .collect();
        allocations.push(format!("std::vector<std::string> vertexNames = {{{}}};", labels.join(", ")));
        allocations.push(format!("std::vector<std::vector<int>> adj({});", vertices.len()));
    }

    /* ---------------- wire ---------------- */

    for edge in &graph.edges {
        let (Some(from), Some(to)) = (graph.node(&edge.from), graph.node(&edge.to)) else {
            continue;
        };
        if from.kind.is_operation() {
            continue;
        }

        // A pointer assignment, whichever handle it left from: a list or
        // doubly-linked cell pointing at any heap node, or a tree node
        // pointing at another tree node. The handle id *is* the field name
        // on the emitted struct, which is what lets `next`/`prev`/`left`/
        // `right` all share one line of codegen.
        let is_list_like = matches!(from.kind, NodeKind::List | NodeKind::Dlist);
        let is_pointer_wire = (is_list_like && pointer_type(to.kind).is_some())
            || (from.kind == NodeKind::Tree && to.kind == NodeKind::Tree);
        if is_pointer_wire {
            wiring.push(format!("{}->{} = {};", name_of(from), edge.from_port, name_of(to)));
        } else if from.kind == NodeKind::Graph && to.kind == NodeKind::Graph {
            wiring.push(format!(
                "adj[{}].push_back({});",
                vertex_index.get(from.id.as_str()).copied().unwrap_or(0),
                vertex_index.get(to.id.as_str()).copied().unwrap_or(0)
            ));
        } else if from.kind == NodeKind::Entry {
            // Handled below, once per pointer.
        } else if from.kind == NodeKind::Var {
            // A variable feeding an operation carries no wiring of its own.
        } else if edge.to_port != "data" && edge.to_port != "on" {
            notes.push(format!(
                "{} → {} isn't a connection C++ can express — skipped.",
                from.kind.label(),
                to.kind.label()
            ));
        }
    }

    /* ---------------- name the entry points ---------------- */

    for node in graph.nodes.iter().filter(|n| n.kind == NodeKind::Entry) {
        let name = name_of(node);
        let Some(target) = targets.get(&node.id).and_then(|id| graph.node(id)) else {
            notes.push(format!("Start pointer \"{name}\" doesn't point at anything yet."));
            continue;
        };
        if let Some(ty) = pointer_type(target.kind) {
            pointers.push(format!("{ty} {name} = {};", name_of(target)));
        } else if target.kind == NodeKind::Graph {
            pointers.push(format!(
                "int {name} = {};",
                vertex_index.get(target.id.as_str()).copied().unwrap_or(0)
            ));
        } else {
            pointers.push(format!("auto& {name} = {};", name_of(target)));
        }
    }

    /* ---------------- operations ---------------- */

    let subject_of = |op: &CanvasNode| -> Option<Subject> {
        let edge = graph
            .edges
            .iter()
            .find(|e| e.to == op.id && e.to_port == "data")?;
        let source = graph.node(&edge.from)?;
        if source.kind == NodeKind::Entry {
            let target = targets.get(&source.id).and_then(|id| graph.node(id))?;
            return Some(Subject { name: name_of(source), kind: target.kind, via_pointer: true });
        }
        Some(Subject { name: name_of(source), kind: source.kind, via_pointer: false })
    };

    let op_nodes: Vec<&CanvasNode> = graph.nodes.iter().filter(|n| n.kind.is_operation()).collect();
    for op in operation_order(&op_nodes, &graph.edges) {
        let Some(Subject { name, kind, via_pointer }) = subject_of(op) else {
            notes.push(format!("{} isn't wired to a structure — skipped.", op.kind.label()));
            continue;
        };
        let value = int_field(op, "value");
        let mut unsupported = || {
            notes.push(format!(
                "{} on a {} isn't supported yet — skipped.",
                op.kind.label(),
                kind.label().to_lowercase()
            ));
        };

        match op.kind {
            NodeKind::Traverse => match kind {
                NodeKind::List => operations.push(block(&[
                    format!("for (Node* cur = {name}; cur != nullptr; cur = cur->next) printf(\"%d \", cur->val);"),
                    "printf(\"\\n\");".to_string(),
                ])),
                NodeKind::Dlist => operations.push(block(&[
                    format!("for (DNode* cur = {name}; cur != nullptr; cur = cur->next) printf(\"%d \", cur->val);"),
                    "printf(\"\\n\");".to_string(),
                ])),
                NodeKind::Tree => {
                    helpers.insert("printInorder");
                    operations.push(format!("printInorder({name});"));
                    operations.push("printf(\"\\n\");".to_string());
                }
                NodeKind::Graph => {
                    helpers.insert("bfs");
                    includes.insert("<queue>");
                    operations.push(format!("bfs(adj, vertexNames, {name});"));
                }
                NodeKind::Array => operations.push(block(&[
                    format!("for (int v : {name}) printf(\"%d \", v);"),
                    "printf(\"\\n\");".to_string(),
                ])),
                NodeKind::Stack => operations.push(block(&[
                    format!("std::stack<int> rest = {name};"),
                    "while (!rest.empty()) { printf(\"%d \", rest.top()); rest.pop(); }".to_string(),
                    "printf(\"\\n\");".to_string(),
                ])),
                NodeKind::Queue => operations.push(block(&[
                    format!("std::queue<int> rest = {name};"),
                    "while (!rest.empty()) { printf(\"%d \", rest.front()); rest.pop(); }".to_string(),
                    "printf(\"\\n\");".to_string(),
                ])),
                NodeKind::Map => operations.push(block(&[
                    format!("for (const auto& kv : {name}) printf(\"%s=%d \", kv.first.c_str(), kv.second);"),
                    "printf(\"\\n\");".to_string(),
                ])),
                _ => unsupported(),
            },
            NodeKind::Insert => match kind {
                NodeKind::List => {
                    helpers.insert("listAppend");
                    operations.push(if via_pointer {
                        format!("{name} = listAppend({name}, {value});")
                    } else {
                        format!("listAppend({name}, {value});")
                    });
                }
                NodeKind::Dlist => {
                    helpers.insert("dlistAppend");
                    operations.push(if via_pointer {
                        format!("{name} = dlistAppend({name}, {value});")
                    } else {
                        format!("dlistAppend({name}, {value});")
                    });
                }
                NodeKind::Tree => {
                    helpers.insert("bstInsert");
                    operations.push(if via_pointer {
                        format!("{name} = bstInsert({name}, {value});")
                    } else {
                        format!("bstInsert({name}, {value});")
                    });
                }
                NodeKind::Array => operations.push(format!("{name}.push_back({value});")),
                NodeKind::Stack | NodeKind::Queue => operations.push(format!("{name}.push({value});")),
                NodeKind::Map => {
                    let key = field(op, "value").trim();
                    let key = if key.is_empty() { "key" } else { key };
                    operations.push(format!("{name}[\"{}\"] = {value};", c_string(key)));
                }
                _ => unsupported(),
            },
            NodeKind::Search => match kind {
                NodeKind::List | NodeKind::Dlist => {
                    let ty = pointer_type(kind).expect("list kinds have a pointer type");
                    operations.push(block(&[
                        format!("{ty} cur = {name};"),
                        format!("while (cur != nullptr && cur->val != {value}) cur = cur->next;"),
                        format!("printf(\"found {value}: %d\\n\", cur != nullptr ? 1 : 0);"),
                    ]));
                }
                NodeKind::Tree => {
                    helpers.insert("bstContains");
                    operations.push(format!(
                        "printf(\"found {value}: %d\\n\", bstContains({name}, {value}) ? 1 : 0);"
                    ));
                }
                NodeKind::Array => operations.push(block(&[
                    "bool found = false;".to_string(),
                    format!("for (int v : {name}) if (v == {value}) {{ found = true; break; }}"),
                    format!("printf(\"found {value}: %d\\n\", found ? 1 : 0);"),
                ])),
                NodeKind::Map => operations.push(format!(
                    "printf(\"found: %d\\n\", {name}.count(\"{}\") ? 1 : 0);",
                    c_string(field(op, "value").trim())
                )),
                _ => unsupported(),
            },
            NodeKind::Print => {
                let label = c_string(field(op, "label").trim());
                if kind == NodeKind::Var {
                    let shown = if label.is_empty() { name.clone() } else { label };
                    operations.push(format!("printf(\"{shown}=%d\\n\", {name});"));
                } else {
                    let shown = if label.is_empty() { kind.label().to_string() } else { label };
                    operations.push(format!("printf(\"{shown}\\n\");"));
                }
            }
            _ => {}
        }
    }

    /* ---------------- assemble ---------------- */

    let mut sections: Vec<String> = Vec::new();
    sections.push("// Generated by Lattice Code-Canvas — edit the graph, not this file.".to_string());
    sections.push(
        includes.iter().map(|inc| format!("#include {inc}")).collect::<Vec<_>>().join("\n"),
    );

    for (kind, body) in [
        (NodeKind::List, STRUCT_LIST),
        (NodeKind::Dlist, STRUCT_DLIST),
        (NodeKind::Tree, STRUCT_TREE),
    ] {
        if structs.contains(&kind) {
            sections.push(body.to_string());
        }
    }
    for (name, body) in HELPER_ORDER {
        if helpers.contains(name) {
            sections.push(body.to_string());
        }
    }

    let mut body: Vec<String> = Vec::new();
    let push_section = |title: &str, lines: Vec<String>, body: &mut Vec<String>| {
        if lines.is_empty() {
            return;
        }
        if !body.is_empty() {
            body.push(String::new());
        }
        body.push(format!("// {title}"));
        body.extend(lines);
    };
    push_section("Nodes", allocations, &mut body);
    push_section("Connections", wiring, &mut body);
    push_section("Entry points", pointers, &mut body);
    push_section("Operations", operations, &mut body);
    if !body.is_empty() {
        body.push(String::new());
    }
    body.push("return 0;".to_string());

    let indented = body
        .iter()
        .flat_map(|line| line.split('\n'))
        .map(|line| if line.is_empty() { String::new() } else { format!("    {line}") })
        .collect::<Vec<_>>()
        .join("\n");
    sections.push(format!("int main() {{\n{indented}\n}}"));

    GeneratedCode { source: format!("{}\n", sections.join("\n\n")), notes }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graph(json: serde_json::Value) -> CanvasGraph {
        serde_json::from_value(json).expect("fixture parses")
    }

    /// Three cells behind a `head` pointer with a traverse wired onto it —
    /// the graph the canvas seeds itself with. Checked in full rather than
    /// by fragments: this is the exact text the frontend preview must also
    /// produce (see the module docs), so a whitespace-level change here is
    /// a real regression, not a cosmetic one.
    #[test]
    fn linked_list_with_traverse_matches_golden() {
        let g = graph(serde_json::json!({
            "nodes": [
                { "id": "h", "kind": "entry", "x": 0.0, "y": 0.0, "fields": { "name": "head" } },
                { "id": "a", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "3" } },
                { "id": "b", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "7" } },
                { "id": "c", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "1" } },
                { "id": "t", "kind": "traverse", "x": 0.0, "y": 0.0, "fields": {} }
            ],
            "edges": [
                { "id": "e1", "from": "h", "fromPort": "target", "to": "a", "toPort": "in" },
                { "id": "e2", "from": "a", "fromPort": "next", "to": "b", "toPort": "in" },
                { "id": "e3", "from": "b", "fromPort": "next", "to": "c", "toPort": "in" },
                { "id": "e4", "from": "h", "fromPort": "target", "to": "t", "toPort": "data" }
            ]
        }));
        let out = generate(&g);
        assert_eq!(
            out.source,
            "// Generated by Lattice Code-Canvas — edit the graph, not this file.\n\
             \n#include <cstdio>\n\
             \nstruct Node {\n    int val;\n    Node* next;\n    Node(int v) : val(v), next(nullptr) {}\n};\n\
             \nint main() {\n\
             \x20   // Nodes\n\
             \x20   Node* n1 = new Node(3);\n\
             \x20   Node* n2 = new Node(7);\n\
             \x20   Node* n3 = new Node(1);\n\
             \n    // Connections\n\
             \x20   n1->next = n2;\n\
             \x20   n2->next = n3;\n\
             \n    // Entry points\n\
             \x20   Node* head = n1;\n\
             \n    // Operations\n\
             \x20   {\n\
             \x20       for (Node* cur = head; cur != nullptr; cur = cur->next) printf(\"%d \", cur->val);\n\
             \x20       printf(\"\\n\");\n\
             \x20   }\n\
             \n    return 0;\n}\n"
        );
        assert!(out.notes.is_empty());
    }

    #[test]
    fn empty_graph_emits_a_placeholder_program() {
        let out = generate(&CanvasGraph::default());
        assert!(out.source.contains("int main() {"));
        assert!(out.notes.is_empty());
    }

    /// Allocating every node before wiring any of them is what lets a cycle
    /// compile at all — `n1` has to exist as a name before `n2->next = n1`.
    #[test]
    fn a_cycle_still_emits_valid_code() {
        let g = graph(serde_json::json!({
            "nodes": [
                { "id": "a", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "1" } },
                { "id": "b", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "2" } }
            ],
            "edges": [
                { "id": "e1", "from": "a", "fromPort": "next", "to": "b", "toPort": "in" },
                { "id": "e2", "from": "b", "fromPort": "next", "to": "a", "toPort": "in" }
            ]
        }));
        let out = generate(&g);
        let alloc_b = out.source.find("Node* n2 = new Node(2);").expect("n2 allocated");
        let wire_back = out.source.find("n2->next = n1;").expect("cycle wired");
        assert!(alloc_b < wire_back, "allocations must precede wiring");
    }

    /// `then` → `on` decides statement order, not canvas order: the insert
    /// is declared last but chained first.
    #[test]
    fn operations_run_in_chain_order() {
        let g = graph(serde_json::json!({
            "nodes": [
                { "id": "h", "kind": "entry", "x": 0.0, "y": 0.0, "fields": { "name": "head" } },
                { "id": "a", "kind": "list", "x": 0.0, "y": 0.0, "fields": { "value": "1" } },
                { "id": "t", "kind": "traverse", "x": 0.0, "y": 0.0, "fields": {} },
                { "id": "i", "kind": "insert", "x": 0.0, "y": 0.0, "fields": { "value": "9" } }
            ],
            "edges": [
                { "id": "e1", "from": "h", "fromPort": "target", "to": "a", "toPort": "in" },
                { "id": "e2", "from": "h", "fromPort": "target", "to": "t", "toPort": "data" },
                { "id": "e3", "from": "h", "fromPort": "target", "to": "i", "toPort": "data" },
                { "id": "e4", "from": "i", "fromPort": "then", "to": "t", "toPort": "on" }
            ]
        }));
        let out = generate(&g);
        let insert = out.source.find("listAppend").expect("insert emitted");
        let traverse = out.source.find("for (Node* cur").expect("traverse emitted");
        assert!(insert < traverse, "chained insert must run before the traverse");
    }

    #[test]
    fn an_unwired_operation_becomes_a_note_not_an_error() {
        let g = graph(serde_json::json!({
            "nodes": [{ "id": "t", "kind": "traverse", "x": 0.0, "y": 0.0, "fields": {} }],
            "edges": []
        }));
        let out = generate(&g);
        assert_eq!(out.notes, vec!["Traverse isn't wired to a structure — skipped."]);
        assert!(out.source.contains("return 0;"));
    }

    /// A name the user typed is claimed before any generated one, and a
    /// second claim on it gets a suffix rather than silently colliding.
    #[test]
    fn user_names_are_claimed_first_and_deduplicated() {
        let g = graph(serde_json::json!({
            "nodes": [
                { "id": "v1", "kind": "var", "x": 0.0, "y": 0.0, "fields": { "name": "head", "value": "1" } },
                { "id": "v2", "kind": "var", "x": 0.0, "y": 0.0, "fields": { "name": "head", "value": "2" } },
                { "id": "v3", "kind": "var", "x": 0.0, "y": 0.0, "fields": { "name": "9lives!", "value": "3" } }
            ],
            "edges": []
        }));
        let out = generate(&g);
        assert!(out.source.contains("int head = 1;"));
        assert!(out.source.contains("int head2 = 2;"));
        assert!(out.source.contains("int _9lives_ = 3;"));
    }

    /// The frontend preview parses field values with JavaScript's
    /// `Number.parseInt`, so this does too — otherwise the same graph would
    /// mean different things on the two sides.
    #[test]
    fn integer_fields_follow_javascript_parse_int() {
        assert_eq!(parse_int_prefix("12abc"), Some(12));
        assert_eq!(parse_int_prefix("  -7 "), Some(-7));
        assert_eq!(parse_int_prefix("abc"), None);
        assert_eq!(parse_int_prefix(""), None);
        assert_eq!(parse_int_prefix("-"), None);
    }

    #[test]
    fn string_fields_are_escaped_into_c_literals() {
        assert_eq!(c_string(r#"hi "there"\"#), r#"hi \"there\"\\"#);
    }
}
