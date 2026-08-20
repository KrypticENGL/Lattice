/**
 * Shape detection (BLUEPRINT.md §9): given a trace step's heap snapshot
 * and the objects reachable from current locals, classify the connected
 * cluster and lay it out for rendering. Scoped down from §9's full list
 * for now — linked-list and tree get dedicated layouts (the shapes our
 * tracer's own test fixtures actually produce today), everything else
 * (cyclic graphs, multi-parent structures, anything unclassified) falls
 * back to a generic node-link layout so nothing ever fails to render.
 * Array/hashmap-specific renderers aren't implemented yet — arrays
 * already display inline as JSON arrays (not heap objects) and our C++
 * tracer doesn't special-case std::map today.
 *
 * Real OOP code rarely exposes a raw pointer chain to `main` — it's
 * usually reached through a manager/wrapper instance (`LinkedList list;`
 * holding a `head`, `Graph g;` holding an adjacency structure). Two
 * things fall out of that which this module handles explicitly:
 *
 * 1. That wrapper is frequently a stack local, not a heap ref — gdb_hook.py
 *    (§8) serializes those inline as `{ type, fields }` rather than
 *    `{ ref }`, so a root-collector that only looks at top-level
 *    `{ ref }` locals finds nothing to draw at all. `forEachRef` walks
 *    into embedded struct/array values (at any depth) to find refs
 *    wherever they actually are.
 * 2. Once found, the wrapper itself isn't part of the structure a reader
 *    means to see — `backtraceToDataRoots` walks *through* it to the
 *    real data-structure root(s) it manages, so the diagram shows the
 *    list/tree/graph the class manages, not a node for the class.
 */

import type { Frame, HeapObject, StepEvent, TraceValue } from "./trace-schema/types";

export type DiagramNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  field: string;
};

export type Diagram = {
  kind: "linked-list" | "tree" | "graph";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

const NODE_SPACING_X = 110;
const LIST_Y = 0;
const TREE_LEVEL_HEIGHT = 100;
const TREE_LEAF_SPACING = 90;
const GRAPH_RADIUS = 130;
// Minimum straight-line gap kept between two nodes sharing a ring — big
// enough to clear NODE_RADIUS (22, defined in DiagramView.tsx) on both
// sides with room to spare, so a ring's radius (below) can be solved for
// from its population without importing across the render/layout split.
const GRAPH_MIN_NODE_ARC = 70;

function isRef(value: TraceValue): value is { ref: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "ref" in value;
}

function isScalar(value: TraceValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Visits every `{ ref }` reachable from `value` without crossing a heap
 * boundary — i.e. it follows embedded structs (`{ type, fields }`, gdb_hook.py's
 * encoding for a stack-local class/struct value) and arrays (a `vector<Node*>`
 * field) at any nesting depth, but does not dereference a ref itself. That's
 * what lets a manager class sitting directly on the stack, or a collection
 * field holding several pointers, still surface the refs it holds. */
function forEachRef(value: TraceValue, visit: (ref: string) => void): void {
  if (value === null) return;
  if (isRef(value)) {
    visit(value.ref);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) forEachRef(v, visit);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value.fields)) forEachRef(v, visit);
  }
}

function collectRootRefs(frames: Frame[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const value of Object.values(frame.locals)) {
      forEachRef(value, (ref) => {
        if (!seen.has(ref)) {
          seen.add(ref);
          roots.push(ref);
        }
      });
    }
  }
  return roots;
}

function outRefs(obj: HeapObject): Array<{ field: string; to: string }> {
  const refs: Array<{ field: string; to: string }> = [];
  for (const [field, value] of Object.entries(obj.fields)) {
    forEachRef(value, (to) => refs.push({ field, to }));
  }
  return refs;
}

/** Type name -> occurrence count among everything forward-reachable from
 * `frontier` (refs only followed outward, no backward closure). Used to
 * tell a data-structure node (a type that recurs — one `ListNode` per
 * element, one `TreeNode` per branch) from a one-off management/wrapper
 * class (a single `LinkedList` or `Graph` instance holding the real
 * root). */
function forwardReachableTypeCounts(heap: Record<string, HeapObject>, frontier: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const visited = new Set<string>();
  const queue = [...frontier];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id) || !heap[id]) continue;
    visited.add(id);
    const obj = heap[id];
    counts.set(obj.type, (counts.get(obj.type) ?? 0) + 1);
    for (const { to } of outRefs(obj)) queue.push(to);
  }
  return counts;
}

/** Walks each raw root past management/wrapper objects to the real
 * data-structure root(s) they hold, so the diagram renders the list/tree/
 * graph a class manages rather than a node for the class itself.
 *
 * A wrapper is recognized structurally, not by name: its type occurs
 * exactly once among everything reachable from the original roots (the
 * nodes it manages recur — one per element/branch — while the manager
 * itself doesn't), and it has at least one outgoing ref to unwrap into.
 * Wrappers nested inside wrappers (a `Graph` holding an `AdjacencyList`
 * holding the actual nodes) are peeled off one layer at a time until a
 * recurring, or childless, type is reached. */
function backtraceToDataRoots(
  heap: Record<string, HeapObject>,
  rawRoots: string[],
): { roots: string[]; wrappers: Set<string> } {
  const typeCounts = forwardReachableTypeCounts(heap, rawRoots);
  const wrappers = new Set<string>();
  const roots: string[] = [];
  const rootsSeen = new Set<string>();

  function unwrap(id: string, path: Set<string>) {
    const obj = heap[id];
    if (!obj || path.has(id)) return; // cycle guard: a wrapper loop has nothing to draw
    const refs = outRefs(obj);
    const isWrapper = (typeCounts.get(obj.type) ?? 0) === 1 && refs.length > 0;
    if (!isWrapper) {
      if (!rootsSeen.has(id)) {
        rootsSeen.add(id);
        roots.push(id);
      }
      return;
    }
    wrappers.add(id);
    const nextPath = new Set(path).add(id);
    for (const { to } of refs) {
      if (heap[to]) unwrap(to, nextPath);
    }
  }

  for (const r of rawRoots) {
    if (heap[r]) unwrap(r, new Set());
  }
  return { roots, wrappers };
}

/** Every heap object the roots touch, directly or indirectly — refs
 * followed in both directions, so a root planted mid-structure (e.g. a
 * `cur` pointer partway down a list) still pulls in the whole thing. */
function connectedComponent(heap: Record<string, HeapObject>, roots: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = roots.filter((id) => heap[id]);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    const obj = heap[id];
    for (const { to } of outRefs(obj)) {
      if (heap[to] && !visited.has(to)) queue.push(to);
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, obj] of Object.entries(heap)) {
      if (visited.has(id)) continue;
      if (outRefs(obj).some(({ to }) => visited.has(to))) {
        visited.add(id);
        grew = true;
      }
    }
  }
  return visited;
}

function pickLabel(obj: HeapObject): string {
  for (const name of ["val", "value", "data", "key"]) {
    const v = obj.fields[name];
    if (v !== undefined && isScalar(v)) return String(v);
  }
  for (const v of Object.values(obj.fields)) {
    if (isScalar(v)) return String(v);
  }
  return obj.type;
}

export function buildDiagram(step: StepEvent): Diagram | null {
  const { heap, frames } = step;
  const rawRoots = collectRootRefs(frames);
  if (rawRoots.length === 0) return null;

  const { roots, wrappers } = backtraceToDataRoots(heap, rawRoots);
  if (roots.length === 0) return null;

  const componentIds = connectedComponent(heap, roots);
  // connectedComponent's backward-closure step would otherwise pull a
  // wrapper back in (it points at a now-visited data node), so drop it
  // after the closure rather than trying to keep it out of the BFS.
  for (const id of wrappers) componentIds.delete(id);
  if (componentIds.size === 0) return null;

  const edges: DiagramEdge[] = [];
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const id of componentIds) {
    for (const { field, to } of outRefs(heap[id])) {
      if (!componentIds.has(to)) continue;
      edges.push({ from: id, to, field });
      outDegree.set(id, (outDegree.get(id) ?? 0) + 1);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  const isChain = [...componentIds].every(
    (id) => (outDegree.get(id) ?? 0) <= 1 && (inDegree.get(id) ?? 0) <= 1,
  );
  // A tree: every node has at most one parent, and exactly one node has
  // none (the root) — a pure cycle has zero such nodes, which correctly
  // falls through to the generic graph layout instead.
  const rootless = [...componentIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const isTree = !isChain && [...componentIds].every((id) => (inDegree.get(id) ?? 0) <= 1) && rootless.length === 1;

  if (isChain) return layoutLinkedList(componentIds, edges, roots, heap);
  if (isTree) return layoutTree(componentIds, edges, rootless[0], heap);
  return layoutGraph(componentIds, edges, heap, roots[0]);
}

/** A "chain" component isn't always *one* chain — every node having at
 * most one in- and one out-edge is equally true of several disjoint
 * chains sitting side by side, which is the normal mid-mutation state of
 * real list code:
 *
 *   - mid-`insertAtHead`, the freshly allocated node is its own one-node
 *     chain until `newNode->next = head` splices it on;
 *   - mid-`append`, likewise, until `cur->next = newNode`;
 *   - mid-destructor, the just-`delete`d head is detached from the
 *     still-live remainder of the list.
 *
 * Walking a single chain from one chosen start therefore silently drops
 * every other node in the component — and which chain survives is decided
 * by `roots` ordering, i.e. by which frame happened to be serialized
 * first, so the *live* list can be the part that disappears (observed: a
 * destructor step rendering only the freed head while `10 -> 20 -> 30`
 * was still reachable). Lay out all of them, end to end along one row. */
function layoutLinkedList(
  ids: Set<string>,
  edges: DiagramEdge[],
  roots: string[],
  heap: Record<string, HeapObject>,
): Diagram {
  const nextOf = new Map(edges.map((e) => [e.from, e.to]));
  const hasIncoming = new Set(edges.map((e) => e.to));

  // Candidate chain heads, best first: a genuine head (nothing points at
  // it) preferred in `roots` order so the structure the user's own locals
  // name leads, then any remaining head, then — for a pure cycle, where
  // every node has an incoming edge and there is no head at all — whatever
  // is still unvisited. The last group guarantees full coverage of `ids`.
  const startCandidates = [
    ...roots.filter((r) => ids.has(r) && !hasIncoming.has(r)),
    ...[...ids].filter((id) => !hasIncoming.has(id)),
    ...roots.filter((r) => ids.has(r)),
    ...ids,
  ];

  const chains: string[][] = [];
  const seen = new Set<string>();
  for (const start of startCandidates) {
    if (seen.has(start)) continue;
    const chain: string[] = [];
    let cur: string | undefined = start;
    while (cur !== undefined && ids.has(cur) && !seen.has(cur)) {
      chain.push(cur);
      seen.add(cur);
      cur = nextOf.get(cur);
    }
    if (chain.length > 0) chains.push(chain);
  }

  // Longest chain first — it's the structure proper, and anchoring it keeps
  // the canvas origin meaningful. `sort` is stable, so equal-length chains
  // keep their discovery order above.
  chains.sort((a, b) => b.length - a.length);

  // Which side of the list does an unlinked fragment belong on? A node that
  // was just `new`ed has no edges yet, so nothing structural says where it
  // goes — but the pointers the frame is *already holding* do. `roots` are
  // the data nodes the live locals reach, so the right-most main-chain node
  // any of them names is the end of the list this frame is working on:
  //
  //   - `append` walks a `cur` to the tail before `cur->next = newNode`,
  //     so a root lands on the last node and the fragment belongs after it;
  //   - `insertAtHead` only ever names `head`, so the only root in the
  //     chain is its first node and the fragment belongs before it.
  //
  // Getting this right means the node is already sitting in its final slot
  // when the link is made, so splicing it in changes nothing but the arrow
  // — instead of the node jumping the width of the whole list.
  const main = chains[0] ?? [];
  const named = new Set(roots);
  let anchorIdx = -1;
  for (let i = 0; i < main.length; i++) {
    if (named.has(main[i])) anchorIdx = i;
  }
  const fragments = chains.slice(1);
  const ordered =
    main.length > 1 && anchorIdx === 0 ? [...fragments, main] : [main, ...fragments];

  // One row, chains laid end to end at the regular node pitch: a node is
  // always beside its neighbours, never stacked above or below one, and a
  // fragment predicted into its slot lines up exactly with the chain it is
  // about to join. The absence of an arrow is what marks it as unlinked.
  let cursor = 0;
  const nodes: DiagramNode[] = ordered.flatMap((chain) => {
    const placed = chain.map((id, i) => ({
      id,
      x: cursor + i * NODE_SPACING_X,
      y: LIST_Y,
      label: pickLabel(heap[id]),
      type: heap[id].type,
    }));
    cursor += chain.length * NODE_SPACING_X;
    return placed;
  });
  return {
    kind: "linked-list",
    nodes,
    edges: edges.filter((e) => seen.has(e.from) && seen.has(e.to)),
  };
}

function layoutTree(
  ids: Set<string>,
  edges: DiagramEdge[],
  root: string,
  heap: Record<string, HeapObject>,
): Diagram {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
  }

  let nextLeafX = 0;
  const positions = new Map<string, { x: number; y: number }>();
  function place(id: string, depth: number): number {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const x = nextLeafX * TREE_LEAF_SPACING;
      nextLeafX += 1;
      positions.set(id, { x, y: depth * TREE_LEVEL_HEIGHT });
      return x;
    }
    const xs = kids.map((k) => place(k, depth + 1));
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    positions.set(id, { x, y: depth * TREE_LEVEL_HEIGHT });
    return x;
  }
  place(root, 0);

  // Re-center on the root so it stays pinned at the canvas origin instead
  // of drifting sideways with the average x of its subtrees (depth 0
  // already puts its y at 0, but x isn't generally 0 — an unbalanced
  // tree's root ends up wherever the leaf-count-weighted average lands).
  const rootPos = positions.get(root) ?? { x: 0, y: 0 };
  const nodes: DiagramNode[] = [...ids].map((id) => {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    return { id, x: pos.x - rootPos.x, y: pos.y - rootPos.y, label: pickLabel(heap[id]), type: heap[id].type };
  });
  return { kind: "tree", nodes, edges };
}

/** Rings the component out from `anchor` by BFS distance rather than
 * dropping every node on one fixed circle in arbitrary Set-iteration
 * order: ring 0 is just the anchor (pinned dead center, and — since every
 * other node's radius is a ring index times a positive step — the only
 * node that can ever land there), ring 1 is everything directly connected
 * to it, ring 2 is everything connected to *that*, and so on. A node
 * therefore always renders next to whichever already-placed neighbor
 * actually reaches it (a "30" wired to "20" lands in 20's ring, angularly
 * grouped with it) instead of at a slot decided by hash/insertion order
 * that has nothing to do with the graph's edges. */
function layoutGraph(
  ids: Set<string>,
  edges: DiagramEdge[],
  heap: Record<string, HeapObject>,
  anchor: string,
): Diagram {
  const list = [...ids];
  const anchorId = ids.has(anchor) ? anchor : (list[0] as string);

  // Undirected adjacency: layout cares which nodes are near which, not
  // which way a pointer happens to run, so an edge is walkable from BFS in
  // either direction.
  const adjacency = new Map<string, string[]>();
  for (const id of list) adjacency.set(id, []);
  for (const e of edges) {
    if (!adjacency.has(e.from) || !adjacency.has(e.to) || e.from === e.to) continue;
    adjacency.get(e.from)?.push(e.to);
    adjacency.get(e.to)?.push(e.from);
  }

  const depth = new Map<string, number>([[anchorId, 0]]);
  const parent = new Map<string, string>();
  const rings: string[][] = [[anchorId]];
  let frontier = [anchorId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const to of adjacency.get(id) ?? []) {
        if (depth.has(to)) continue;
        depth.set(to, (depth.get(id) ?? 0) + 1);
        parent.set(to, id);
        next.push(to);
      }
    }
    if (next.length > 0) rings.push(next);
    frontier = next;
  }
  // A cycle reachable only through a back-edge the BFS never walked (the
  // anchor's own component, per connectedComponent's backward-closure
  // step, can include nodes no forward+outward walk from the anchor
  // actually touches) still needs a slot — give it one on its own outer
  // ring rather than dropping it.
  const stray = list.filter((id) => !depth.has(id));
  if (stray.length > 0) rings.push(stray);

  const angle = new Map<string, number>([[anchorId, 0]]);
  const positions = new Map<string, { x: number; y: number }>([[anchorId, { x: 0, y: 0 }]]);
  for (let d = 1; d < rings.length; d++) {
    // Sorting by the parent's already-assigned angle (stable, so members
    // of the same parent stay in their BFS discovery order relative to
    // each other) is what clusters siblings — and transitively anything
    // hanging off the same neighbor — together instead of scattering them
    // around the ring by id.
    const nodes = [...rings[d]].sort((a, b) => {
      const pa = angle.get(parent.get(a) ?? "") ?? 0;
      const pb = angle.get(parent.get(b) ?? "") ?? 0;
      return pa - pb;
    });
    const count = nodes.length;
    // Radius has to satisfy two separate overlap risks: rings colliding
    // with each other (GRAPH_RADIUS * d, growing with depth) and nodes on
    // *this* ring crowding each other once there are enough of them that
    // even spacing around a fixed-size circle would pack them closer than
    // GRAPH_MIN_NODE_ARC apart.
    const radius = Math.max(GRAPH_RADIUS * d, (count * GRAPH_MIN_NODE_ARC) / (2 * Math.PI));
    nodes.forEach((id, i) => {
      const a = (2 * Math.PI * i) / count;
      angle.set(id, a);
      positions.set(id, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
    });
  }

  const nodes: DiagramNode[] = list.map((id) => {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    return { id, x: pos.x, y: pos.y, label: pickLabel(heap[id]), type: heap[id].type };
  });
  return { kind: "graph", nodes, edges };
}
