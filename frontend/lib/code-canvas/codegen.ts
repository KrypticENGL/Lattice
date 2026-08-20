/**
 * Code-Canvas → C++ source.
 *
 * The canvas graph is the truth; this is a pure function over it, re-run on
 * every edit so the code pane always shows exactly what the current wiring
 * means. C++ specifically because that's the only language with a working
 * tracer today (see FloatingEditor's LANGUAGES) — the generated file is
 * meant to be handed straight to the Visualizer's execute pipeline
 * (BLUEPRINT.md §3), so it has to actually compile and run.
 *
 * Structure of the emitted program:
 *   includes → structs → helpers → main { allocate, wire, name, operate }
 *
 * Allocating every node *before* wiring any of them is what makes cyclic
 * graphs (a linked list looping back on itself, a general digraph) emit
 * valid code for free.
 */

import {
  NODE_TYPES,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type NodeKind,
} from "./graph";

export type GeneratedCode = {
  code: string;
  /** Human-readable warnings about parts of the graph that couldn't be
   * compiled — an unwired operation, an empty container. Surfaced in the
   * code pane rather than swallowed. */
  notes: string[];
};

const EMPTY_PROGRAM = `// Nothing on the canvas yet.
//
// Drag a node out of the palette on the left, wire a few together,
// and the code for that structure appears here as you build.

int main() {
    return 0;
}
`;

const STRUCTS: Partial<Record<NodeKind, string>> = {
  list: `struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};`,
  dlist: `struct DNode {
    int val;
    DNode* prev;
    DNode* next;
    DNode(int v) : val(v), prev(nullptr), next(nullptr) {}
};`,
  tree: `struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
};`,
};

const HELPERS: Record<string, string> = {
  listAppend: `Node* listAppend(Node* head, int v) {
    Node* fresh = new Node(v);
    if (!head) return fresh;
    Node* cur = head;
    while (cur->next) cur = cur->next;
    cur->next = fresh;
    return head;
}`,
  dlistAppend: `DNode* dlistAppend(DNode* head, int v) {
    DNode* fresh = new DNode(v);
    if (!head) return fresh;
    DNode* cur = head;
    while (cur->next) cur = cur->next;
    cur->next = fresh;
    fresh->prev = cur;
    return head;
}`,
  printInorder: `void printInorder(TreeNode* n) {
    if (!n) return;
    printInorder(n->left);
    printf("%d ", n->val);
    printInorder(n->right);
}`,
  bstInsert: `TreeNode* bstInsert(TreeNode* root, int v) {
    if (!root) return new TreeNode(v);
    if (v < root->val) root->left = bstInsert(root->left, v);
    else if (v > root->val) root->right = bstInsert(root->right, v);
    return root;
}`,
  bstContains: `bool bstContains(TreeNode* root, int v) {
    while (root) {
        if (root->val == v) return true;
        root = v < root->val ? root->left : root->right;
    }
    return false;
}`,
  bfs: `void bfs(const std::vector<std::vector<int>>& adj,
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
    printf("\\n");
}`,
};

const POINTER_TYPE: Partial<Record<NodeKind, string>> = {
  list: "Node*",
  dlist: "DNode*",
  tree: "TreeNode*",
};

function sanitize(raw: string, fallback: string) {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^(\d)/, "_$1");
  return cleaned || fallback;
}

function intField(node: CanvasNode, id: string, fallback = 0) {
  const parsed = Number.parseInt((node.fields[id] ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listField(node: CanvasNode, id: string) {
  return (node.fields[id] ?? "")
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cString(raw: string) {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Assigns every node a unique C++ identifier. Entry pointers and variables
 * get to keep the name the user typed (that's the whole point of those
 * blocks); everything else gets a short kind-prefixed name. */
function nameNodes(graph: CanvasGraph, targetOf: (n: CanvasNode) => CanvasNode | null) {
  const names = new Map<string, string>();
  const used = new Set<string>();
  const counters = new Map<string, number>();

  const claim = (base: string) => {
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}${suffix++}`;
    used.add(candidate);
    return candidate;
  };
  const sequential = (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return claim(`${prefix}${next}`);
  };

  // Entry/variable names first, so a generated name can never steal a name
  // the user explicitly asked for.
  for (const node of graph.nodes) {
    if (node.kind === "entry") {
      const target = targetOf(node);
      const fallback =
        target?.kind === "tree" ? "root" : target?.kind === "graph" ? "start" : "head";
      names.set(node.id, claim(sanitize(node.fields.name ?? "", fallback)));
    } else if (node.kind === "var") {
      names.set(node.id, claim(sanitize(node.fields.name ?? "", "value")));
    }
  }

  const PREFIX: Record<string, string> = {
    list: "n",
    dlist: "d",
    tree: "t",
    graph: "v",
    array: "arr",
    stack: "st",
    queue: "q",
    map: "m",
  };
  for (const node of graph.nodes) {
    if (names.has(node.id)) continue;
    const prefix = PREFIX[node.kind];
    if (prefix) names.set(node.id, sequential(prefix));
  }
  return names;
}

/** Operations run in wiring order: each chain starts at an operation whose
 * `after` handle is empty, then follows `then` links. Operations that are
 * part of no chain still run, appended in canvas order, so a lone block
 * isn't silently ignored. */
function operationOrder(ops: CanvasNode[], edges: CanvasEdge[]) {
  const byId = new Map(ops.map((n) => [n.id, n]));
  const nextOf = new Map<string, string>();
  const chained = new Set<string>();
  for (const edge of edges) {
    if (edge.fromPort !== "then" || edge.toPort !== "on") continue;
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (!nextOf.has(edge.from)) nextOf.set(edge.from, edge.to);
    chained.add(edge.to);
  }

  const ordered: CanvasNode[] = [];
  const seen = new Set<string>();
  const walk = (start: CanvasNode) => {
    let current: CanvasNode | undefined = start;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      ordered.push(current);
      const next = nextOf.get(current.id);
      current = next ? byId.get(next) : undefined;
    }
  };
  for (const op of ops) if (!chained.has(op.id)) walk(op);
  for (const op of ops) if (!seen.has(op.id)) walk(op);
  return ordered;
}

export function generateCpp(graph: CanvasGraph): GeneratedCode {
  if (graph.nodes.length === 0) return { code: EMPTY_PROGRAM, notes: [] };

  const notes: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const includes = new Set<string>(["<cstdio>"]);
  const helpers = new Set<string>();
  const structs = new Set<NodeKind>();

  const edgeTo = (id: string, port: string) =>
    graph.edges.find((e) => e.to === id && e.toPort === port);

  /** What an entry pointer points at, if anything. The same handle also
   * feeds operations (see `entry`'s port spec), so operation targets are
   * skipped here — a pointer points at a *structure*. */
  const targetOf = (node: CanvasNode) => {
    for (const edge of graph.edges) {
      if (edge.from !== node.id || edge.fromPort !== "target") continue;
      const target = byId.get(edge.to);
      if (target && NODE_TYPES[target.kind].category !== "operation") return target;
    }
    return null;
  };

  const names = nameNodes(graph, targetOf);
  const nameOf = (node: CanvasNode) => names.get(node.id) ?? node.id;

  const nodesOf = (...kinds: NodeKind[]) => graph.nodes.filter((n) => kinds.includes(n.kind));
  const vertices = nodesOf("graph");
  const vertexIndex = new Map(vertices.map((n, i) => [n.id, i]));

  const allocations: string[] = [];
  const wiring: string[] = [];
  const pointers: string[] = [];
  const operations: string[] = [];

  /* ---------------- allocate ---------------- */

  for (const node of graph.nodes) {
    const name = nameOf(node);
    switch (node.kind) {
      case "list":
      case "dlist":
      case "tree": {
        structs.add(node.kind);
        const type = POINTER_TYPE[node.kind]!;
        allocations.push(`${type} ${name} = new ${type.slice(0, -1)}(${intField(node, "value")});`);
        break;
      }
      case "array": {
        includes.add("<vector>");
        const items = listField(node, "items").map((v) => Number.parseInt(v, 10) || 0);
        allocations.push(`std::vector<int> ${name} = {${items.join(", ")}};`);
        break;
      }
      case "stack":
      case "queue": {
        includes.add(node.kind === "stack" ? "<stack>" : "<queue>");
        const items = listField(node, "items").map((v) => Number.parseInt(v, 10) || 0);
        allocations.push(`std::${node.kind}<int> ${name};`);
        for (const item of items) allocations.push(`${name}.push(${item});`);
        break;
      }
      case "map": {
        includes.add("<unordered_map>");
        includes.add("<string>");
        allocations.push(`std::unordered_map<std::string, int> ${name};`);
        for (const entry of listField(node, "entries")) {
          const [key, rawValue = "0"] = entry.split(":");
          allocations.push(
            `${name}["${cString((key ?? "").trim())}"] = ${Number.parseInt(rawValue, 10) || 0};`,
          );
        }
        break;
      }
      case "var":
        allocations.push(`int ${name} = ${intField(node, "value")};`);
        break;
      default:
        break;
    }
  }

  if (vertices.length > 0) {
    includes.add("<vector>");
    includes.add("<string>");
    const labels = vertices.map((v, i) => `"${cString((v.fields.value ?? "").trim() || `v${i}`)}"`);
    allocations.push(`std::vector<std::string> vertexNames = {${labels.join(", ")}};`);
    allocations.push(`std::vector<std::vector<int>> adj(${vertices.length});`);
  }

  /* ---------------- wire ---------------- */

  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    if (NODE_TYPES[from.kind].category === "operation") continue;

    if ((from.kind === "list" || from.kind === "dlist") && POINTER_TYPE[to.kind]) {
      wiring.push(`${nameOf(from)}->${edge.fromPort} = ${nameOf(to)};`);
    } else if (from.kind === "tree" && to.kind === "tree") {
      wiring.push(`${nameOf(from)}->${edge.fromPort} = ${nameOf(to)};`);
    } else if (from.kind === "graph" && to.kind === "graph") {
      wiring.push(`adj[${vertexIndex.get(from.id)}].push_back(${vertexIndex.get(to.id)});`);
    } else if (from.kind === "entry") {
      // Handled below, once per pointer.
    } else if (from.kind === "var") {
      // A variable feeding an operation carries no wiring of its own.
    } else if (edge.toPort !== "data" && edge.toPort !== "on") {
      notes.push(
        `${NODE_TYPES[from.kind].label} → ${NODE_TYPES[to.kind].label} isn't a connection C++ can express — skipped.`,
      );
    }
  }

  /* ---------------- name the entry points ---------------- */

  for (const node of nodesOf("entry")) {
    const target = targetOf(node);
    const name = nameOf(node);
    if (!target) {
      notes.push(`Start pointer "${name}" doesn't point at anything yet.`);
      continue;
    }
    const pointerType = POINTER_TYPE[target.kind];
    if (pointerType) {
      pointers.push(`${pointerType} ${name} = ${nameOf(target)};`);
    } else if (target.kind === "graph") {
      pointers.push(`int ${name} = ${vertexIndex.get(target.id) ?? 0};`);
    } else {
      pointers.push(`auto& ${name} = ${nameOf(target)};`);
    }
  }

  /* ---------------- operations ---------------- */

  /** The structure an operation acts on, resolved through a start pointer
   * when there is one — so `traverse` wired to `head` traverses from the
   * head, not from whichever cell happens to be under the cursor. */
  const subjectOf = (op: CanvasNode) => {
    const edge = edgeTo(op.id, "data");
    const source = edge ? byId.get(edge.from) : null;
    if (!source) return null;
    if (source.kind === "entry") {
      const target = targetOf(source);
      return target ? { name: nameOf(source), kind: target.kind, viaPointer: true } : null;
    }
    return { name: nameOf(source), kind: source.kind, viaPointer: false };
  };

  const block = (lines: string[]) => ["{", ...lines.map((l) => `    ${l}`), "}"].join("\n");

  for (const op of operationOrder(nodesOf("traverse", "insert", "search", "print"), graph.edges)) {
    const subject = subjectOf(op);
    if (!subject) {
      notes.push(`${NODE_TYPES[op.kind].label} isn't wired to a structure — skipped.`);
      continue;
    }
    const { name, kind, viaPointer } = subject;
    const value = intField(op, "value");
    const unsupported = () => {
      notes.push(
        `${NODE_TYPES[op.kind].label} on a ${NODE_TYPES[kind].label.toLowerCase()} isn't supported yet — skipped.`,
      );
    };

    if (op.kind === "traverse") {
      switch (kind) {
        case "list":
          operations.push(
            block([
              `for (Node* cur = ${name}; cur != nullptr; cur = cur->next) printf("%d ", cur->val);`,
              `printf("\\n");`,
            ]),
          );
          break;
        case "dlist":
          operations.push(
            block([
              `for (DNode* cur = ${name}; cur != nullptr; cur = cur->next) printf("%d ", cur->val);`,
              `printf("\\n");`,
            ]),
          );
          break;
        case "tree":
          helpers.add("printInorder");
          operations.push(`printInorder(${name});`, `printf("\\n");`);
          break;
        case "graph":
          helpers.add("bfs");
          includes.add("<queue>");
          operations.push(`bfs(adj, vertexNames, ${name});`);
          break;
        case "array":
          operations.push(
            block([`for (int v : ${name}) printf("%d ", v);`, `printf("\\n");`]),
          );
          break;
        case "stack":
          operations.push(
            block([
              `std::stack<int> rest = ${name};`,
              `while (!rest.empty()) { printf("%d ", rest.top()); rest.pop(); }`,
              `printf("\\n");`,
            ]),
          );
          break;
        case "queue":
          operations.push(
            block([
              `std::queue<int> rest = ${name};`,
              `while (!rest.empty()) { printf("%d ", rest.front()); rest.pop(); }`,
              `printf("\\n");`,
            ]),
          );
          break;
        case "map":
          operations.push(
            block([
              `for (const auto& kv : ${name}) printf("%s=%d ", kv.first.c_str(), kv.second);`,
              `printf("\\n");`,
            ]),
          );
          break;
        default:
          unsupported();
      }
    } else if (op.kind === "insert") {
      switch (kind) {
        case "list":
          helpers.add("listAppend");
          operations.push(
            viaPointer ? `${name} = listAppend(${name}, ${value});` : `listAppend(${name}, ${value});`,
          );
          break;
        case "dlist":
          helpers.add("dlistAppend");
          operations.push(
            viaPointer ? `${name} = dlistAppend(${name}, ${value});` : `dlistAppend(${name}, ${value});`,
          );
          break;
        case "tree":
          helpers.add("bstInsert");
          operations.push(
            viaPointer ? `${name} = bstInsert(${name}, ${value});` : `bstInsert(${name}, ${value});`,
          );
          break;
        case "array":
          operations.push(`${name}.push_back(${value});`);
          break;
        case "stack":
        case "queue":
          operations.push(`${name}.push(${value});`);
          break;
        case "map":
          operations.push(`${name}["${cString((op.fields.value ?? "key").trim() || "key")}"] = ${value};`);
          break;
        default:
          unsupported();
      }
    } else if (op.kind === "search") {
      switch (kind) {
        case "list":
        case "dlist": {
          const type = POINTER_TYPE[kind]!;
          operations.push(
            block([
              `${type} cur = ${name};`,
              `while (cur != nullptr && cur->val != ${value}) cur = cur->next;`,
              `printf("found ${value}: %d\\n", cur != nullptr ? 1 : 0);`,
            ]),
          );
          break;
        }
        case "tree":
          helpers.add("bstContains");
          operations.push(`printf("found ${value}: %d\\n", bstContains(${name}, ${value}) ? 1 : 0);`);
          break;
        case "array":
          operations.push(
            block([
              `bool found = false;`,
              `for (int v : ${name}) if (v == ${value}) { found = true; break; }`,
              `printf("found ${value}: %d\\n", found ? 1 : 0);`,
            ]),
          );
          break;
        case "map":
          operations.push(
            `printf("found: %d\\n", ${name}.count("${cString((op.fields.value ?? "").trim())}") ? 1 : 0);`,
          );
          break;
        default:
          unsupported();
      }
    } else if (op.kind === "print") {
      const label = cString((op.fields.label ?? "").trim());
      if (kind === "var") {
        operations.push(`printf("${label || name}=%d\\n", ${name});`);
      } else {
        operations.push(`printf("${label || NODE_TYPES[kind].label}\\n");`);
      }
    }
  }

  /* ---------------- assemble ---------------- */

  const sections: string[] = [];
  sections.push("// Generated by Lattice Code-Canvas — edit the graph, not this file.");
  sections.push([...includes].sort().map((inc) => `#include ${inc}`).join("\n"));

  const structOrder: NodeKind[] = ["list", "dlist", "tree"];
  for (const kind of structOrder) if (structs.has(kind)) sections.push(STRUCTS[kind]!);

  const helperOrder = ["listAppend", "dlistAppend", "printInorder", "bstInsert", "bstContains", "bfs"];
  for (const helper of helperOrder) if (helpers.has(helper)) sections.push(HELPERS[helper]);

  const body: string[] = [];
  const push = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    if (body.length > 0) body.push("");
    body.push(`// ${title}`, ...lines);
  };
  push("Nodes", allocations);
  push("Connections", wiring);
  push("Entry points", pointers);
  push("Operations", operations);
  if (body.length > 0) body.push("");
  body.push("return 0;");

  const indented = body
    .flatMap((line) => line.split("\n"))
    .map((line) => (line ? `    ${line}` : ""))
    .join("\n");
  sections.push(`int main() {\n${indented}\n}`);

  return { code: `${sections.join("\n\n")}\n`, notes };
}
