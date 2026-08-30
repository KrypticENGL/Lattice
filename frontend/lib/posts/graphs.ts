/**
 * The Code-Canvas graph behind each seed post.
 *
 * A post already carries a `Diagram` — the traced picture the Visualizer
 * draws. That is an *output*: it says what the structure looked like at one
 * step of one run, and nothing can be edited back out of it. The graph here
 * is the *input* the author built, which is what a reader actually wants
 * when they say "let me try this myself", and it is what `.lattice` needs
 * (see lib/lattice-file/format.ts — a file is a graph, its code and its
 * preview travelling together).
 *
 * So each graph below is the same structure as its post's diagram, drawn in
 * the block vocabulary of `lib/code-canvas/graph.ts`: the same values, the
 * same links, laid out in roughly the same shape so the file's preview and
 * the post's canvas are recognisably the same piece of work.
 *
 * ## Ids are written out, not generated
 *
 * `createNode`/`connect` mint ids from `Date.now()`, which is right for a
 * canvas somebody is editing and wrong for seed data: the same post would
 * serialize to different bytes on every render, and the server-rendered
 * markup would not match the client's. Every id here is spelled out and
 * derived from the graph it belongs to, so a post's `.lattice` file is the
 * same file every time it is downloaded.
 *
 * ## Where a graph cannot say what the diagram says
 *
 * The block library is deliberately small (BLUEPRINT.md §4.3), so two
 * things do not survive the trip and are called out at their definitions:
 * edge weights, which live on a `Diagram` edge but have nowhere to go on a
 * `CanvasEdge`, and non-numeric values, which the blocks accept as text but
 * `codegen.ts` reads with `parseInt`.
 */

import {
  nodeSize,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type NodeKind,
} from "@/lib/code-canvas/graph";

function node(
  id: string,
  kind: NodeKind,
  x: number,
  y: number,
  fields: Record<string, string> = {},
): CanvasNode {
  return { id, kind, x, y, fields };
}

/** An edge whose id is its own endpoints. Unique by construction — the
 * canvas already refuses a second wire between the same two handles — and
 * stable across reloads, which minting one would not be. */
function wire(from: string, fromPort: string, to: string, toPort: string): CanvasEdge {
  return { id: `${from}.${fromPort}-${to}.${toPort}`, from, fromPort, to, toPort };
}

/** Top-left corner for the `i`th of `count` cards placed evenly around a
 * circle, starting at the top and running clockwise.
 *
 * Positions the card's *centre* on the circle rather than its corner, which
 * is the difference between a ring and a lopsided spiral: cards are 150-odd
 * wide and 66 tall, so cornering them throws every one of them up and to
 * the left by a different amount once the angle changes.
 */
function ringSpot(i: number, count: number, radius: number, kind: NodeKind) {
  const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
  const { width, height } = nodeSize(kind);
  return {
    x: Math.round(Math.cos(angle) * radius - width / 2),
    y: Math.round(Math.sin(angle) * radius - height / 2),
  };
}

/**
 * p1 — the list with a cycle in it.
 *
 * Laid out as a rho for the same reason the post's diagram is: five cells
 * on one line with a back-edge along them draws a line with an arrowhead at
 * each end, and the loop is the entire point.
 *
 * The `traverse` block is wired on deliberately, bug and all. It compiles to
 * `for (cur = head; cur != nullptr; cur = cur->next)`, which on this graph
 * never terminates — which is exactly the afternoon the post is about. A
 * reader opening the file gets the broken canvas, not a fixed one.
 */
const CYCLIC_LIST_GRAPH: CanvasGraph = {
  nodes: [
    node("head", "entry", 0, 40, { name: "head" }),
    node("c0", "list", 280, 30, { value: "3" }),
    node("c1", "list", 510, 30, { value: "9" }),
    node("c2", "list", 740, 30, { value: "14" }),
    node("c3", "list", 930, 190, { value: "27" }),
    node("c4", "list", 700, 320, { value: "41" }),
    node("walk", "traverse", 300, 300),
  ],
  edges: [
    wire("head", "target", "c0", "in"),
    wire("c0", "next", "c1", "in"),
    wire("c1", "next", "c2", "in"),
    wire("c2", "next", "c3", "in"),
    wire("c3", "next", "c4", "in"),
    // The bad assignment: the tail points back into the middle.
    wire("c4", "next", "c2", "in"),
    wire("head", "target", "walk", "data"),
  ],
};

/**
 * p2 — the tree before the rotation.
 *
 * 30 is still at the root, which is the state the post's canvas is frozen
 * at. The `search` is for 25, the node that ends up on the wrong side of
 * the invariant if the rotation drops a link.
 */
const BST_GRAPH: CanvasGraph = {
  nodes: [
    node("root", "entry", 250, -150, { name: "root" }),
    node("t0", "tree", 300, 0, { value: "30" }),
    node("t1", "tree", 100, 170, { value: "20" }),
    node("t2", "tree", 500, 170, { value: "45" }),
    node("t3", "tree", -20, 340, { value: "10" }),
    node("t4", "tree", 190, 340, { value: "25" }),
    node("t5", "tree", 400, 340, { value: "40" }),
    node("t6", "tree", 610, 340, { value: "60" }),
    node("find", "search", 830, 150, { value: "25" }),
  ],
  edges: [
    wire("root", "target", "t0", "in"),
    wire("t0", "left", "t1", "in"),
    wire("t0", "right", "t2", "in"),
    wire("t1", "left", "t3", "in"),
    wire("t1", "right", "t4", "in"),
    wire("t2", "left", "t5", "in"),
    wire("t2", "right", "t6", "in"),
    wire("root", "target", "find", "data"),
  ],
};

/**
 * p3 — the six-node graph Dijkstra runs on.
 *
 * The weights do not come across. A `Diagram` edge carries a `field` and the
 * post puts the cost there; a `CanvasEdge` is four ids and nothing else, and
 * inventing a place to put them would be inventing a format. What the file
 * carries is the adjacency, which is the part a reader would otherwise have
 * to re-draw by hand — the costs are in the post, one scroll above.
 */
const DIJKSTRA_GRAPH: CanvasGraph = {
  nodes: [
    node("start", "entry", -560, -33, { name: "start" }),
    ...["a", "b", "c", "d", "e", "f"].map((label, i) => {
      const { x, y } = ringSpot(i, 6, 340, "graph");
      return node(`v${i}`, "graph", x, y, { value: label });
    }),
    node("walk", "traverse", -88, -20),
  ],
  edges: [
    wire("start", "target", "v0", "in"),
    wire("v0", "edges", "v1", "in"),
    wire("v0", "edges", "v5", "in"),
    wire("v1", "edges", "v2", "in"),
    wire("v2", "edges", "v3", "in"),
    wire("v3", "edges", "v4", "in"),
    wire("v4", "edges", "v5", "in"),
    wire("v1", "edges", "v4", "in"),
    wire("v2", "edges", "v5", "in"),
    wire("start", "target", "walk", "data"),
  ],
};

/**
 * p4 — the ring buffer.
 *
 * Drawn as a circle, and the wrap from 5 back to 0 is an ordinary `next`
 * wire like every other one, because the post's whole argument is that it
 * is not a special case.
 *
 * No `traverse` here: walking this would not terminate either, and unlike
 * p1 that would be an accident rather than the subject.
 */
const RING_BUFFER_GRAPH: CanvasGraph = {
  nodes: [
    node("head", "entry", -560, -33, { name: "head" }),
    ...[0, 1, 2, 3, 4, 5].map((value, i) => {
      const { x, y } = ringSpot(i, 6, 300, "list");
      return node(`c${i}`, "list", x, y, { value: String(value) });
    }),
  ],
  edges: [
    wire("head", "target", "c0", "in"),
    wire("c0", "next", "c1", "in"),
    wire("c1", "next", "c2", "in"),
    wire("c2", "next", "c3", "in"),
    wire("c3", "next", "c4", "in"),
    wire("c4", "next", "c5", "in"),
    wire("c5", "next", "c0", "in"),
  ],
};

/**
 * p5 — the LRU cache's recency list.
 *
 * Doubly linked here where the post's diagram shows only the `next` chain:
 * the diagram drops `prev` because the two edges land on top of each other
 * once routed, but a canvas draws its wires off named handles on opposite
 * sides of the card, so both directions are visible and both are the point.
 *
 * `head` and `tail` are two start pointers at the two ends, which is what
 * makes eviction O(1) and is the pair the post says has to stay in step.
 * The keys are k4/k7/k1/k9 in the post; the blocks hold their numbers,
 * because a block's value is free text but `codegen.ts` reads it with
 * `parseInt` and every non-numeric key would compile to 0.
 */
const LRU_GRAPH: CanvasGraph = {
  nodes: [
    node("head", "entry", 0, 0, { name: "head" }),
    node("d0", "dlist", 280, 0, { value: "4" }),
    node("d1", "dlist", 510, 0, { value: "7" }),
    node("d2", "dlist", 740, 0, { value: "1" }),
    node("d3", "dlist", 970, 0, { value: "9" }),
    node("tail", "entry", 970, 200, { name: "tail" }),
    node("find", "search", 400, 200, { value: "1" }),
  ],
  edges: [
    wire("head", "target", "d0", "in"),
    wire("d0", "next", "d1", "in"),
    wire("d1", "next", "d2", "in"),
    wire("d2", "next", "d3", "in"),
    wire("d1", "prev", "d0", "in"),
    wire("d2", "prev", "d1", "in"),
    wire("d3", "prev", "d2", "in"),
    wire("tail", "target", "d3", "in"),
    wire("head", "target", "find", "data"),
  ],
};

/**
 * p6 — cat, cot and try, inserted.
 *
 * Tree blocks rather than a structure of their own: the post's argument is
 * that a trie *is* a tree whose edges spell, and the block library has no
 * trie in it. Every node here has at most two children, so binary blocks
 * hold the whole thing.
 *
 * The letters live in the blocks' value fields, which is what the canvas and
 * the file's preview both show. Generated C++ is the one place they do not
 * survive — `TreeNode` holds an int — so no operation is wired on: a
 * traversal that printed eight zeroes would say less than the picture does.
 */
const TRIE_GRAPH: CanvasGraph = {
  nodes: [
    node("root", "entry", 250, -150, { name: "root" }),
    node("t0", "tree", 300, 0, { value: "·" }),
    node("t1", "tree", 120, 170, { value: "c" }),
    node("t2", "tree", 480, 170, { value: "t" }),
    node("t3", "tree", 60, 340, { value: "a" }),
    node("t4", "tree", 390, 340, { value: "o" }),
    node("t5", "tree", 600, 340, { value: "r" }),
    node("t6", "tree", 60, 510, { value: "t" }),
    node("t7", "tree", 600, 510, { value: "y" }),
  ],
  edges: [
    wire("root", "target", "t0", "in"),
    wire("t0", "left", "t1", "in"),
    wire("t0", "right", "t2", "in"),
    wire("t1", "left", "t3", "in"),
    wire("t2", "left", "t4", "in"),
    wire("t2", "right", "t5", "in"),
    wire("t3", "left", "t6", "in"),
    wire("t5", "right", "t7", "in"),
  ],
};

/** Keyed by post id, so `data.ts` reads as a list of posts rather than a
 * list of posts with a graph inlined into each one. */
export const POST_GRAPHS: Record<string, CanvasGraph> = {
  p1: CYCLIC_LIST_GRAPH,
  p2: BST_GRAPH,
  p3: DIJKSTRA_GRAPH,
  p4: RING_BUFFER_GRAPH,
  p5: LRU_GRAPH,
  p6: TRIE_GRAPH,
};
