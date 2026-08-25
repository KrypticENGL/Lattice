/**
 * How Lattice routes a line between two things, in both workspaces.
 *
 * Routing is a rendering choice, not a property of what is being drawn —
 * the same linked list is the same linked list whether its arrows are
 * bowed or squared off — so the chosen style rides in browser storage
 * rather than in any saved canvas, and one setting covers the whole app:
 * "I like right-angle lines" is a statement about the person, not about
 * the page they happen to be on.
 *
 * The two workspaces draw *different geometry* from the same vocabulary,
 * and that is the reason this file holds the words and the arithmetic but
 * only one of the two routers. The Visualizer joins circles, so it trims
 * both ends back by a radius (`circleEdgePath`, below). Code-Canvas joins
 * named ports on the edges of cards, so its wires have to leave and
 * arrive square-on to a specific side — that router lives with the node
 * vocabulary it depends on, in lib/code-canvas/graph.ts. Both build on
 * the primitives here so the two can't drift apart on what "curved"
 * means.
 */

export type EdgeStyle = "curved" | "straight" | "rectangular";

export const EDGE_STYLES: { id: EdgeStyle; label: string; hint: string }[] = [
  { id: "curved", label: "Curved", hint: "Bowed arcs" },
  { id: "straight", label: "Straight", hint: "Direct lines" },
  { id: "rectangular", label: "Right-angle", hint: "Squared-off elbows" },
];

/** A miniature of each route, so the control shows what it does rather
 * than naming it. Drawn in a 16×16 box to match the other header icons. */
export const EDGE_STYLE_GLYPH: Record<EdgeStyle, string> = {
  curved: "M2 12 Q 8 1, 14 12",
  straight: "M2 13 L14 3",
  rectangular: "M2 13 H8 V3 H14",
};

export const EDGE_STYLE_STORAGE_KEY = "lattice:edge-style";

export function isEdgeStyle(value: unknown): value is EdgeStyle {
  return value === "curved" || value === "straight" || value === "rectangular";
}

export type Point = { x: number; y: number };

/** Clearance between whatever an arrow points at and the arrow's own tip.
 * Small enough to still read as "attached to this", big enough that the
 * head is not touching it. */
export const ARROW_GAP = 5;

/** How far a right-angle route runs straight out of its starting point
 * before it is allowed to turn. Without a stub the first corner can land
 * on the thing the line is leaving. */
const STUB = 22;

/** How far a curved edge bows away from the straight line between its
 * ends. Scales with separation so short hops stay nearly straight and
 * long ones get a readable arc, and caps out so a very long edge doesn't
 * balloon across the canvas. */
export function bowFor(length: number) {
  return Math.min(38, length * 0.16);
}

/** Moves `point` `distance` along the direction of `unit`. */
export function step(point: Point, unit: Point, distance: number): Point {
  return { x: point.x + unit.x * distance, y: point.y + unit.y * distance };
}

export function unitVector(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return { x: dx / length, y: dy / length };
}

export function round(n: number) {
  // One decimal is well under a pixel at any zoom either canvas allows,
  // and keeps the `d` string short enough that re-deriving it on every
  // frame of a drag is not itself the expensive part.
  return Math.round(n * 10) / 10;
}

/** Drops consecutive duplicates: two things that happen to line up on an
 * axis put both elbows of a right-angle route on the same spot, and
 * emitting the same point twice adds a zero-length segment that
 * `stroke-linecap: round` can render as a stray dot. */
export function distinctPoints(points: Point[]): Point[] {
  return points.filter(
    (p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.05 || Math.abs(p.y - points[i - 1].y) > 0.05,
  );
}

export function polyline(points: Point[]): string {
  const distinct = distinctPoints(points);
  const [head, ...rest] = distinct;
  if (!head) return "";
  return `M ${round(head.x)} ${round(head.y)}` + rest.map((p) => ` L ${round(p.x)} ${round(p.y)}`).join("");
}

/** The point halfway *along* a polyline, by length rather than by index —
 * an elbowed route's middle segment is generally not where the middle of
 * the line is, and chrome that has to sit on the line (a label, a delete
 * button) has to sit where the line actually is. */
export function polylineMidpoint(points: Point[]): Point {
  const distinct = distinctPoints(points);
  if (distinct.length < 2) return distinct[0] ?? { x: 0, y: 0 };
  const lengths = distinct.slice(1).map((p, i) => Math.hypot(p.x - distinct[i].x, p.y - distinct[i].y));
  const half = lengths.reduce((a, b) => a + b, 0) / 2;
  let travelled = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (travelled + lengths[i] >= half) {
      const t = lengths[i] === 0 ? 0 : (half - travelled) / lengths[i];
      return {
        x: distinct[i].x + (distinct[i + 1].x - distinct[i].x) * t,
        y: distinct[i].y + (distinct[i + 1].y - distinct[i].y) * t,
      };
    }
    travelled += lengths[i];
  }
  return distinct[distinct.length - 1];
}

/** Point on a cubic bezier at t = 0.5, which reduces to this weighted
 * average. The parametric middle rather than the arc-length one — they
 * differ slightly on a lopsided curve — but it is exactly on the curve,
 * which is the property callers are after. */
export function cubicMidpoint(p0: Point, c1: Point, c2: Point, p3: Point): Point {
  return {
    x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
    y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8,
  };
}

/** Point on a quadratic bezier at t = 0.5. Same reasoning as above. */
export function quadraticMidpoint(p0: Point, c: Point, p2: Point): Point {
  return { x: (p0.x + 2 * c.x + p2.x) / 4, y: (p0.y + 2 * c.y + p2.y) / 4 };
}

/**
 * An orthogonal route between two points, each of which has to be left
 * (or entered) along a given axis.
 *
 * Both ends get a stub along their own axis first, so the line leaves
 * square-on to whatever it is attached to; the stubs are then joined with
 * a Z when both ends face the same way and an L when they face across
 * each other, which is the whole case analysis.
 */
export function orthogonalRoute(
  from: Point,
  fromAxis: "x" | "y",
  fromDirection: Point,
  to: Point,
  toAxis: "x" | "y",
  toDirection: Point,
): Point[] {
  const a = step(from, fromDirection, STUB);
  const b = step(to, toDirection, STUB);

  if (fromAxis === "x" && toAxis === "x") {
    const midX = (a.x + b.x) / 2;
    return [from, a, { x: midX, y: a.y }, { x: midX, y: b.y }, b, to];
  }
  if (fromAxis === "y" && toAxis === "y") {
    const midY = (a.y + b.y) / 2;
    return [from, a, { x: a.x, y: midY }, { x: b.x, y: midY }, b, to];
  }
  // Mixed: one corner is enough, placed on the axis each end needs.
  const corner = fromAxis === "x" ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [from, a, corner, b, to];
}

/**
 * The path between two circular nodes' centres, in the given style, with
 * both ends pulled back to the rim of their node. Used by the Visualizer,
 * whose nodes are circles of a single radius.
 *
 * The pull-back is the whole reason this returns a path rather than a
 * plain line between the two centres. An edge drawn centre-to-centre ends
 * *underneath* the target circle, and a `marker-end` arrowhead goes with
 * it — which is how a diagram ends up with no visible sense of direction
 * at all despite every edge carrying an arrow.
 *
 * Returns an empty string for a degenerate edge (two nodes on the same
 * point, or closer together than their own radii), which renders nothing
 * rather than an arrow pointing backwards through itself.
 */
export function circleEdgePath(from: Point, to: Point, style: EdgeStyle, radius: number): string {
  const direct = unitVector(from, to);
  if (!direct) return "";
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span <= radius * 2 + ARROW_GAP) return "";

  if (style === "rectangular") {
    // A circle has no preferred side, so the route turns on the dominant
    // axis first — which is simply the direction it is already heading.
    const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const corners: Point[] = horizontalFirst
      ? [
          { x: midX, y: from.y },
          { x: midX, y: to.y },
        ]
      : [
          { x: from.x, y: midY },
          { x: to.x, y: midY },
        ];

    // Trim along each end's own leg, not along the straight line between
    // the nodes: the legs are axis-aligned and generally point somewhere
    // else entirely, so trimming along the chord would leave the ends
    // floating off the route.
    const outward = unitVector(from, corners[0]) ?? direct;
    const inward = unitVector(corners[1], to) ?? direct;
    return polyline([step(from, outward, radius), ...corners, step(to, inward, -(radius + ARROW_GAP))]);
  }

  if (style === "straight") {
    return polyline([step(from, direct, radius), step(to, direct, -(radius + ARROW_GAP))]);
  }

  // Curved: a quadratic bowed perpendicular to the chord. The normal is
  // taken consistently on one side so every edge in a drawing bows the
  // same way and the result reads as a style rather than as noise.
  const normal = { x: -direct.y, y: direct.x };
  const control = step({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, normal, bowFor(span));

  // Trim along the tangents at each end — for a quadratic those are the
  // directions to and from the control point — so the ends sit on the
  // curve rather than on the chord it is bowed away from.
  const leaving = unitVector(from, control) ?? direct;
  const arriving = unitVector(control, to) ?? direct;
  const start = step(from, leaving, radius);
  const end = step(to, arriving, -(radius + ARROW_GAP));
  return `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)}, ${round(end.x)} ${round(end.y)}`;
}
