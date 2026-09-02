/**
 * Where each heap object sits in the memory diagram.
 *
 * ## Why the heap is not just a list
 *
 * The diagram used to lay the heap out in whatever order the tracer
 * happened to hand the objects over — one column in the exported drawing,
 * a wrapping grid on screen — and then drew a wire for every pointer
 * wherever the two ends landed. For a handful of unrelated allocations
 * that is fine. For the thing the panel exists to show, it is not: a
 * linked list is `a → b → c → d`, and if those four cards are stacked
 * vertically then every one of those wires has to leave a card's right
 * edge, travel back across the whole card, and come in the left edge of
 * the one below. Four arrows, four full-width backwards loops, all
 * through the cards. A tree or a graph is worse, because the wires then
 * also cross each other.
 *
 * The overlap is not a drawing bug. It is what you get when the layout
 * ignores the edges and the router has to make up the difference.
 *
 * So the layout is the fix: objects are placed in columns by how far they
 * are from a pointer you actually hold — the ones a local points at go in
 * the first column, what *those* point at goes in the second, and so on.
 * Then a pointer's natural direction is left-to-right, one column over,
 * and its wire is a short hop through the gap between two columns rather
 * than a line across the picture. `a → b → c → d` comes out as the row of
 * boxes and arrows you would have drawn on paper.
 *
 * ## Bands
 *
 * Depth is unbounded — a list of forty nodes is forty columns — and a
 * drawing forty columns wide is one nobody scrolls to the end of. So the
 * columns wrap: past `MAX_COLUMNS` the next depth starts a new band below
 * the last, the way text wraps. Wrapping costs one backwards wire per
 * band, which is a price worth paying once per eight columns and not once
 * per node.
 */

import type { HeapObject } from "@/lib/trace-schema/types";
import { heapPointers } from "./pointers";

/** How many columns a band is allowed before the next depth wraps. */
export const MAX_COLUMNS = 8;

export type HeapPlacement = {
  /** Distance, in pointer hops, from the nearest object a local points at. */
  depth: number;
  /** `depth / MAX_COLUMNS` — which wrapped row of columns this sits in. */
  band: number;
  /** `depth % MAX_COLUMNS` — the column within that band. */
  column: number;
  /** Position down that column. */
  row: number;
};

export type HeapLayout = {
  /** `bands[band][column]` is a top-to-bottom list of addresses. Every
   * band has `MAX_COLUMNS` columns except the last, and a column may be
   * empty; both drawings render the array as given so they agree. */
  bands: string[][][];
  place: Map<string, HeapPlacement>;
};

/**
 * Objects in the order they should be visited, and how deep each one is.
 *
 * Breadth-first from the roots, so an object is placed one column past
 * whichever of its parents was found first, and siblings come out in the
 * order their parent lists them — which is already very close to the
 * ordering that minimises crossings between two columns, without a
 * separate pass to compute one.
 *
 * Roots are the objects with nothing on the heap pointing at them. Not
 * "everything a local points at": a `curr` walking a list points at the
 * middle of it, and treating that as a root would drag the third node
 * into the first column and fold the chain back on itself. An object that
 * only something else on the heap points at is not where a reader starts
 * reading, whatever the stack happens to be holding at this instant.
 *
 * A cycle has no root, so anything still unplaced once the roots are
 * exhausted is seeded in heap order and walked the same way. That is what
 * keeps a ring buffer or a doubly-linked list from vanishing.
 */
function visit(heap: Record<string, HeapObject>): Map<string, number> {
  const addresses = Object.keys(heap);

  /** Targets of each object, deduped and in field order — only the ones
   * still allocated, since a dangling pointer has no card to point at. */
  const edges = new Map<string, string[]>();
  const pointedAt = new Set<string>();
  for (const pointer of heapPointers(heap)) {
    if (!(pointer.target in heap)) continue;
    const list = edges.get(pointer.address) ?? [];
    if (!list.includes(pointer.target)) list.push(pointer.target);
    edges.set(pointer.address, list);
    if (pointer.target !== pointer.address) pointedAt.add(pointer.target);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  const seed = (address: string) => {
    if (depth.has(address)) return;
    depth.set(address, 0);
    queue.push(address);
  };

  for (const address of addresses) {
    if (!pointedAt.has(address)) seed(address);
  }

  let head = 0;
  let unseeded = 0;
  while (true) {
    if (head === queue.length) {
      while (unseeded < addresses.length && depth.has(addresses[unseeded])) unseeded++;
      if (unseeded === addresses.length) break;
      seed(addresses[unseeded]);
    }
    const address = queue[head++];
    const next = depth.get(address)! + 1;
    for (const target of edges.get(address) ?? []) {
      if (depth.has(target)) continue;
      depth.set(target, next);
      queue.push(target);
    }
  }

  // `queue` is the discovery order; re-keying by it rather than by
  // `addresses` is what puts a parent's children next to each other.
  const ordered = new Map<string, number>();
  for (const address of queue) ordered.set(address, depth.get(address)!);
  return ordered;
}

export function layoutHeap(heap: Record<string, HeapObject>): HeapLayout {
  const ordered = visit(heap);
  const place = new Map<string, HeapPlacement>();
  const bands: string[][][] = [];

  for (const [address, depth] of ordered) {
    const band = Math.floor(depth / MAX_COLUMNS);
    const column = depth % MAX_COLUMNS;
    while (bands.length <= band) {
      bands.push(Array.from({ length: MAX_COLUMNS }, () => [] as string[]));
    }
    const cells = bands[band][column];
    place.set(address, { depth, band, column, row: cells.length });
    cells.push(address);
  }

  // The last band is usually short; carrying eight columns' worth of
  // empty flex children past the end of it would reserve width the
  // drawing never uses, and the exported SVG sizes itself from this.
  for (const band of bands) {
    while (band.length > 1 && band[band.length - 1].length === 0) band.pop();
  }

  return { bands, place };
}

/** The widest band, which is what the whole drawing has to be wide enough
 * for. Zero when nothing is allocated. */
export function layoutColumns(layout: HeapLayout): number {
  return layout.bands.reduce((max, band) => Math.max(max, band.length), 0);
}
