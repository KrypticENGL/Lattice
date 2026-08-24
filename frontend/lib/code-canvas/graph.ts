/**
 * Code-Canvas node vocabulary — the "block library" behind /dashboard/code-canvas.
 *
 * Deliberately scoped (BLUEPRINT.md §4.3): v1 covers the same structures the
 * Visualizer already understands — linked lists, doubly linked lists, binary
 * trees, graphs, arrays, stacks, queues, hashmaps — plus a handful of
 * operations over them. Arbitrary control flow is out of scope on purpose;
 * "drag-and-drop general-purpose programming" is an unbounded problem.
 *
 * Everything the canvas renders and everything `codegen.ts` compiles is
 * derived from the `NODE_TYPES` catalog below, so adding a block means
 * adding one entry here plus its emitter in codegen.
 */

export type NodeKind =
  | "entry"
  | "list"
  | "dlist"
  | "tree"
  | "graph"
  | "array"
  | "stack"
  | "queue"
  | "map"
  | "var"
  | "traverse"
  | "insert"
  | "search"
  | "print";

export type PortSide = "top" | "bottom" | "left" | "right";

export type PortSpec = {
  id: string;
  label: string;
  side: PortSide;
  /** Position along `side`, 0..1 from its start (left→right, top→bottom). */
  offset: number;
  /** Outputs only: may this port feed more than one target at a time? */
  multi?: boolean;
};

export type FieldSpec = {
  id: string;
  label: string;
  placeholder: string;
  /** Renders a textarea (one entry per line) instead of a single-line input. */
  multiline?: boolean;
};

export type NodeCategory = "structure" | "container" | "operation";

export type NodeTypeSpec = {
  kind: NodeKind;
  label: string;
  /** One line, shown in the palette and in the tutorial. */
  blurb: string;
  category: NodeCategory;
  accent: string;
  width: number;
  inputs: PortSpec[];
  outputs: PortSpec[];
  fields: FieldSpec[];
};

/** Category colours. Structures/containers stay in the diagram palette's
 * orange family (see DiagramView's PALETTE); operations borrow the editor
 * theme's keyword purple, so "a thing" and "an action on a thing" are
 * distinguishable at a glance without inventing a new hue. */
const ACCENT = {
  entry: "var(--accent-primary)",
  list: "#f2a65a",
  dlist: "#f7b267",
  tree: "#e8993d",
  graph: "#c2703d",
  container: "#a85c2e",
  variable: "#8b949e",
  operation: "#b147eb",
} as const;

const IN_LEFT: PortSpec = { id: "in", label: "in", side: "left", offset: 0.5 };
const IN_TOP: PortSpec = { id: "in", label: "in", side: "top", offset: 0.5 };
/** Operations take two kinds of wire: `data` (top) is *what* to act on,
 * `on` (left) is the previous step in the sequence. Keeping them on
 * separate handles is what lets a chain of operations have an order
 * without also overloading "what am I operating on". */
/** Containers are terminal — nothing points *out* of an array at another
 * structure — but they still have to be able to feed an operation, so they
 * carry one multi-connection "use" handle. */
const USE_OUT: PortSpec = { id: "use", label: "use", side: "right", offset: 0.5, multi: true };

const OP_DATA: PortSpec = { id: "data", label: "on", side: "top", offset: 0.5 };
const OP_IN: PortSpec = { id: "on", label: "after", side: "left", offset: 0.5 };
const OP_OUT: PortSpec = { id: "then", label: "then", side: "right", offset: 0.5 };

export const NODE_TYPES: Record<NodeKind, NodeTypeSpec> = {
  entry: {
    kind: "entry",
    label: "Start pointer",
    blurb: "Names the structure — head, root, and so on. Every graph starts here.",
    category: "structure",
    accent: ACCENT.entry,
    width: 165,
    inputs: [],
    // Multi on purpose: one pointer both names the structure *and* is what
    // operations get wired to, so it has to feed more than one wire.
    outputs: [{ id: "target", label: "points to", side: "right", offset: 0.5, multi: true }],
    fields: [{ id: "name", label: "name", placeholder: "head" }],
  },
  list: {
    kind: "list",
    label: "List node",
    blurb: "One singly-linked cell: a value and exactly one next pointer.",
    category: "structure",
    accent: ACCENT.list,
    width: 150,
    inputs: [IN_LEFT],
    outputs: [{ id: "next", label: "next", side: "right", offset: 0.5 }],
    fields: [{ id: "value", label: "value", placeholder: "0" }],
  },
  dlist: {
    kind: "dlist",
    label: "Doubly node",
    blurb: "A cell with both prev and next — wire them in either direction.",
    category: "structure",
    accent: ACCENT.dlist,
    width: 165,
    inputs: [IN_TOP],
    outputs: [
      { id: "prev", label: "prev", side: "left", offset: 0.5 },
      { id: "next", label: "next", side: "right", offset: 0.5 },
    ],
    fields: [{ id: "value", label: "value", placeholder: "0" }],
  },
  tree: {
    kind: "tree",
    label: "Tree node",
    blurb: "A binary node: one value, two child handles on the bottom edge.",
    category: "structure",
    accent: ACCENT.tree,
    width: 155,
    inputs: [IN_TOP],
    outputs: [
      { id: "left", label: "left", side: "bottom", offset: 0.26 },
      { id: "right", label: "right", side: "bottom", offset: 0.74 },
    ],
    fields: [{ id: "value", label: "value", placeholder: "0" }],
  },
  graph: {
    kind: "graph",
    label: "Vertex",
    blurb: "A graph vertex. Its edge handle takes as many connections as you like.",
    category: "structure",
    accent: ACCENT.graph,
    width: 150,
    inputs: [IN_LEFT],
    outputs: [{ id: "edges", label: "edges", side: "right", offset: 0.5, multi: true }],
    fields: [{ id: "value", label: "label", placeholder: "A" }],
  },
  array: {
    kind: "array",
    label: "Array",
    blurb: "A vector of ints, written as a comma-separated list.",
    category: "container",
    accent: ACCENT.container,
    width: 190,
    inputs: [IN_TOP],
    outputs: [USE_OUT],
    fields: [{ id: "items", label: "items", placeholder: "3, 7, 1, 9" }],
  },
  stack: {
    kind: "stack",
    label: "Stack",
    blurb: "LIFO container. Items are pushed left to right.",
    category: "container",
    accent: ACCENT.container,
    width: 180,
    inputs: [IN_TOP],
    outputs: [USE_OUT],
    fields: [{ id: "items", label: "items", placeholder: "3, 7, 1" }],
  },
  queue: {
    kind: "queue",
    label: "Queue",
    blurb: "FIFO container. The first item listed is the first one out.",
    category: "container",
    accent: ACCENT.container,
    width: 180,
    inputs: [IN_TOP],
    outputs: [USE_OUT],
    fields: [{ id: "items", label: "items", placeholder: "3, 7, 1" }],
  },
  map: {
    kind: "map",
    label: "Hash map",
    blurb: "String→int table. One key: value pair per line.",
    category: "container",
    accent: ACCENT.container,
    width: 200,
    inputs: [IN_TOP],
    outputs: [USE_OUT],
    fields: [{ id: "entries", label: "entries", placeholder: "alpha: 1\nbeta: 2", multiline: true }],
  },
  var: {
    kind: "var",
    label: "Variable",
    blurb: "A plain int you can print or search for.",
    category: "container",
    accent: ACCENT.variable,
    width: 175,
    inputs: [],
    outputs: [{ id: "value", label: "value", side: "right", offset: 0.5, multi: true }],
    fields: [
      { id: "name", label: "name", placeholder: "target" },
      { id: "value", label: "value", placeholder: "7" },
    ],
  },
  traverse: {
    kind: "traverse",
    label: "Traverse",
    blurb: "Walks whatever it's wired to and prints every value it visits.",
    category: "operation",
    accent: ACCENT.operation,
    width: 175,
    inputs: [OP_DATA, OP_IN],
    outputs: [OP_OUT],
    fields: [],
  },
  insert: {
    kind: "insert",
    label: "Insert",
    blurb: "Adds a value — appends to a list, BST-inserts into a tree, pushes onto a container.",
    category: "operation",
    accent: ACCENT.operation,
    width: 175,
    inputs: [OP_DATA, OP_IN],
    outputs: [OP_OUT],
    fields: [{ id: "value", label: "value", placeholder: "5" }],
  },
  search: {
    kind: "search",
    label: "Search",
    blurb: "Looks for a value and reports whether it was found.",
    category: "operation",
    accent: ACCENT.operation,
    width: 175,
    inputs: [OP_DATA, OP_IN],
    outputs: [OP_OUT],
    fields: [{ id: "value", label: "find", placeholder: "7" }],
  },
  print: {
    kind: "print",
    label: "Print",
    blurb: "Prints a single value or a short message.",
    category: "operation",
    accent: ACCENT.operation,
    width: 175,
    inputs: [OP_DATA, OP_IN],
    outputs: [OP_OUT],
    fields: [{ id: "label", label: "label", placeholder: "done" }],
  },
};

export const PALETTE_GROUPS: { title: string; kinds: NodeKind[] }[] = [
  { title: "Structures", kinds: ["entry", "list", "dlist", "tree", "graph"] },
  { title: "Containers", kinds: ["array", "stack", "queue", "map", "var"] },
  { title: "Operations", kinds: ["traverse", "insert", "search", "print"] },
];

export type CanvasNode = {
  id: string;
  kind: NodeKind;
  /** World-space position of the card's top-left corner. */
  x: number;
  y: number;
  fields: Record<string, string>;
};

export type CanvasEdge = {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
};

export type CanvasGraph = { nodes: CanvasNode[]; edges: CanvasEdge[] };

export const EMPTY_GRAPH: CanvasGraph = { nodes: [], edges: [] };

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export const NODE_HEADER_HEIGHT = 32;
const FIELD_ROW_HEIGHT = 26;
const MULTILINE_ROW_HEIGHT = 52;
const BODY_PADDING = 8;

/** A node card's rendered size. Shared by the renderer and the edge router
 * so a handle's drawn position and its wire's endpoint can never disagree. */
export function nodeSize(kind: NodeKind) {
  const spec = NODE_TYPES[kind];
  const body = spec.fields.reduce(
    (total, f) => total + (f.multiline ? MULTILINE_ROW_HEIGHT : FIELD_ROW_HEIGHT),
    0,
  );
  return {
    width: spec.width,
    height: NODE_HEADER_HEIGHT + (spec.fields.length ? body + BODY_PADDING : BODY_PADDING),
  };
}

/** World-space centre of one port on one placed node. */
export function portPosition(node: CanvasNode, port: PortSpec) {
  const { width, height } = nodeSize(node.kind);
  switch (port.side) {
    case "left":
      return { x: node.x, y: node.y + height * port.offset };
    case "right":
      return { x: node.x + width, y: node.y + height * port.offset };
    case "top":
      return { x: node.x + width * port.offset, y: node.y };
    case "bottom":
      return { x: node.x + width * port.offset, y: node.y + height };
  }
}

/** Unit vector pointing out of the node at `side` — the direction a wire
 * should leave (or arrive at) so it meets the card square-on. */
export function portNormal(side: PortSide) {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
  }
}

export function findPort(kind: NodeKind, portId: string): PortSpec | undefined {
  const spec = NODE_TYPES[kind];
  return spec.outputs.find((p) => p.id === portId) ?? spec.inputs.find((p) => p.id === portId);
}

/** The two control points of the wire between these ports. Shared by
 * everything that needs to know where the wire actually *goes*, not just
 * how to draw it — the bow is what separates the curve from the straight
 * line between its endpoints, so anything deriving a position from a wire
 * has to be working from the same numbers the path was built with. */
function wireControls(
  from: { x: number; y: number },
  fromSide: PortSide,
  to: { x: number; y: number },
  toSide: PortSide,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const bow = Math.max(40, Math.min(160, distance * 0.45));
  const a = portNormal(fromSide);
  const b = portNormal(toSide);
  return {
    c1: { x: from.x + a.x * bow, y: from.y + a.y * bow },
    c2: { x: to.x + b.x * bow, y: to.y + b.y * bow },
  };
}

/** Cubic bezier between two points, bowed along each end's outward normal.
 * The control-point distance scales with separation so short wires stay
 * tight and long ones keep a readable arc. */
export function wirePath(
  from: { x: number; y: number },
  fromSide: PortSide,
  to: { x: number; y: number },
  toSide: PortSide,
) {
  const { c1, c2 } = wireControls(from, fromSide, to, toSide);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/**
 * A point that lies *on* the wire `wirePath` draws, for chrome that has to
 * sit on the line — the wire's label and its delete button.
 *
 * Averaging the two endpoints instead is only correct for a wire that
 * happens to be straight. The further the bow throws the curve off that
 * chord, the further the midpoint drifts into empty canvas: a wire
 * leaving a right-hand port and arriving at a port below and well to the
 * right bellies out far enough to leave the chord midpoint some 60px from
 * anything drawn, which reads as the button belonging to no wire at all.
 *
 * This is the curve evaluated at t = 0.5, which for a cubic reduces to
 * the weighted average below. That is the parametric middle rather than
 * the arc-length middle — they differ slightly on a lopsided curve — but
 * it is exactly on the line, which is the property being asked for.
 */
export function wireMidpoint(
  from: { x: number; y: number },
  fromSide: PortSide,
  to: { x: number; y: number },
  toSide: PortSide,
) {
  const { c1, c2 } = wireControls(from, fromSide, to, toSide);
  return {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
  };
}

/* ------------------------------------------------------------------ */
/* Graph edits                                                         */
/* ------------------------------------------------------------------ */

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createNode(kind: NodeKind, x: number, y: number): CanvasNode {
  const fields: Record<string, string> = {};
  for (const field of NODE_TYPES[kind].fields) fields[field.id] = "";
  return { id: nextId(kind), kind, x, y, fields };
}

/**
 * Whether a wire from `fromPort` on `from` may land on `toPort` of `to`.
 * Returns a reason string when it may not, so the canvas can say *why*
 * a drop was rejected instead of silently dropping it.
 */
export function connectionError(
  graph: CanvasGraph,
  from: CanvasNode,
  fromPortId: string,
  to: CanvasNode,
  toPortId: string,
): string | null {
  if (from.id === to.id) return "A node can't connect to itself.";
  const outPort = NODE_TYPES[from.kind].outputs.find((p) => p.id === fromPortId);
  const inPort = NODE_TYPES[to.kind].inputs.find((p) => p.id === toPortId);
  if (!outPort || !inPort) return "Those handles don't fit together.";

  const isOperation = (n: CanvasNode) => NODE_TYPES[n.kind].category === "operation";
  if (toPortId === "on" && !(isOperation(from) && fromPortId === "then")) {
    return "The 'after' handle takes the previous step's 'then' handle.";
  }
  if (toPortId === "data" && isOperation(from)) {
    return "Wire a structure into 'on' — chain operations through 'then' instead.";
  }
  if (fromPortId === "then" && !isOperation(to)) {
    return "'then' runs the next operation — it can't point at a structure.";
  }

  const duplicate = graph.edges.some(
    (e) => e.from === from.id && e.fromPort === fromPortId && e.to === to.id && e.toPort === toPortId,
  );
  if (duplicate) return "Those two are already connected.";
  return null;
}

/** Adds an edge, enforcing single-connection outputs by replacing whatever
 * that handle was previously wired to (a `next` pointer has one target —
 * re-dragging it should re-point it, not silently fail). */
export function connect(
  graph: CanvasGraph,
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): CanvasGraph {
  const source = graph.nodes.find((n) => n.id === from);
  if (!source) return graph;
  const port = NODE_TYPES[source.kind].outputs.find((p) => p.id === fromPort);
  const edges = port?.multi
    ? graph.edges
    : graph.edges.filter((e) => !(e.from === from && e.fromPort === fromPort));
  return { ...graph, edges: [...edges, { id: nextId("edge"), from, fromPort, to, toPort }] };
}

export function removeNode(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function removeEdge(graph: CanvasGraph, id: string): CanvasGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Tolerant of graphs written by an older build: unknown kinds and edges
 * pointing at missing nodes are dropped rather than crashing the page. */
export function parseGraph(raw: unknown): CanvasGraph | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<CanvasGraph>;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  const nodes = value.nodes.filter(
    (n): n is CanvasNode =>
      !!n && typeof n.id === "string" && typeof n.x === "number" && typeof n.y === "number" && n.kind in NODE_TYPES,
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = value.edges.filter(
    (e): e is CanvasEdge => !!e && typeof e.id === "string" && ids.has(e.from) && ids.has(e.to),
  );
  return { nodes, edges };
}

/**
 * A drop point at (or just past) `x, y` that doesn't land on top of an
 * existing card. Clicking three blocks in a row from the palette should
 * give three readable blocks, not one stack of three.
 */
export function freeSpotNear(graph: CanvasGraph, kind: NodeKind, x: number, y: number) {
  const STEP = 30;
  const GAP = 16;
  const size = nodeSize(kind);
  let spot = { x, y };
  for (let attempt = 0; attempt < 40; attempt++) {
    const clash = graph.nodes.some((other) => {
      const box = nodeSize(other.kind);
      return (
        spot.x < other.x + box.width + GAP &&
        spot.x + size.width + GAP > other.x &&
        spot.y < other.y + box.height + GAP &&
        spot.y + size.height + GAP > other.y
      );
    });
    if (!clash) return spot;
    spot = { x: spot.x + STEP, y: spot.y + STEP };
  }
  return spot;
}

/** A tiny worked example — a three-cell list behind a `head` pointer, with
 * a traverse wired onto it. Seeded on a first visit so the canvas, the
 * wires, and the code pane all have something to show while the tutorial
 * talks about them; an empty grid teaches nothing. */
export function starterGraph(): CanvasGraph {
  const head = createNode("entry", 0, 40);
  head.fields.name = "head";
  const cells = [3, 7, 1].map((value, i) => {
    const cell = createNode("list", 260 + i * 230, 30);
    cell.fields.value = String(value);
    return cell;
  });
  const walk = createNode("traverse", 300, 260);

  const graph: CanvasGraph = { nodes: [head, ...cells, walk], edges: [] };
  let next = connect(graph, head.id, "target", cells[0].id, "in");
  next = connect(next, cells[0].id, "next", cells[1].id, "in");
  next = connect(next, cells[1].id, "next", cells[2].id, "in");
  return connect(next, head.id, "target", walk.id, "data");
}
