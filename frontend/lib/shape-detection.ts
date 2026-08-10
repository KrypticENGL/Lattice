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

function isRef(value: TraceValue): value is { ref: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "ref" in value;
}

function isScalar(value: TraceValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function collectRootRefs(frames: Frame[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const value of Object.values(frame.locals)) {
      if (isRef(value) && !seen.has(value.ref)) {
        seen.add(value.ref);
        roots.push(value.ref);
      }
    }
  }
  return roots;
}

function outRefs(obj: HeapObject): Array<{ field: string; to: string }> {
  const refs: Array<{ field: string; to: string }> = [];
  for (const [field, value] of Object.entries(obj.fields)) {
    if (isRef(value)) refs.push({ field, to: value.ref });
  }
  return refs;
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
  const roots = collectRootRefs(frames);
  if (roots.length === 0) return null;

  const componentIds = connectedComponent(heap, roots);
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

function layoutLinkedList(
  ids: Set<string>,
  edges: DiagramEdge[],
  roots: string[],
  heap: Record<string, HeapObject>,
): Diagram {
  const nextOf = new Map(edges.map((e) => [e.from, e.to]));
  const hasIncoming = new Set(edges.map((e) => e.to));
  const start =
    roots.find((r) => ids.has(r) && !hasIncoming.has(r)) ??
    [...ids].find((id) => !hasIncoming.has(id)) ??
    roots[0];

  const order: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start;
  while (cur !== undefined && ids.has(cur) && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = nextOf.get(cur);
  }

  const nodes: DiagramNode[] = order.map((id, i) => ({
    id,
    x: i * NODE_SPACING_X,
    y: LIST_Y,
    label: pickLabel(heap[id]),
    type: heap[id].type,
  }));
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

function layoutGraph(
  ids: Set<string>,
  edges: DiagramEdge[],
  heap: Record<string, HeapObject>,
  anchor: string,
): Diagram {
  const list = [...ids];
  const n = Math.max(list.length, 1);
  const raw = list.map((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { id, x: GRAPH_RADIUS * Math.cos(angle), y: GRAPH_RADIUS * Math.sin(angle) };
  });
  // Re-center on the main/root reference so it stays pinned at the canvas
  // origin rather than wherever its index around the circle happened to
  // land — same reasoning as layoutTree's re-centering.
  const anchorPos = raw.find((p) => p.id === anchor) ?? raw[0] ?? { x: 0, y: 0 };
  const nodes: DiagramNode[] = raw.map((p) => ({
    id: p.id,
    x: p.x - anchorPos.x,
    y: p.y - anchorPos.y,
    label: pickLabel(heap[p.id]),
    type: heap[p.id].type,
  }));
  return { kind: "graph", nodes, edges };
}
