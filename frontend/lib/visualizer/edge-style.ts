/**
 * How the Visualizer routes a wire between two nodes.
 *
 * Routing is a rendering choice, not a property of the traced structure —
 * the same linked list is the same linked list whether its arrows are
 * bowed or squared off — so it lives here rather than in shape-detection,
 * and the picked style rides in browser storage rather than in the saved
 * canvas. It is shared by DiagramView (which draws the paths) and the
 * Visualizer page (which owns the control), which is the only reason it
 * is a module instead of a private helper.
 */

export type EdgeStyle = "curved" | "straight" | "rectangular";

export const EDGE_STYLES: { id: EdgeStyle; label: string; hint: string }[] = [
  { id: "curved", label: "Curved", hint: "Bowed arcs" },
  { id: "straight", label: "Straight", hint: "Direct lines" },
  { id: "rectangular", label: "Right-angle", hint: "Squared-off elbows" },
];

export const EDGE_STYLE_STORAGE_KEY = "lattice:visualizer:edge-style";

export function isEdgeStyle(value: unknown): value is EdgeStyle {
  return value === "curved" || value === "straight" || value === "rectangular";
}

type Point = { x: number; y: number };

/** Clearance between a node's rim and the arrow tip that points at it.
 * Small enough to still read as "attached to this node", big enough that
 * the arrowhead is not touching the circle. */
const ARROW_GAP = 5;

/** How far a curved edge bows away from the straight line between its
 * ends. Scales with separation so short hops stay nearly straight and
 * long ones get a readable arc, and caps out so a very long edge doesn't
 * balloon across the canvas. */
function bowFor(length: number) {
  return Math.min(38, length * 0.16);
}

/** Moves `point` `distance` along the direction of `unit`. */
function step(point: Point, unit: Point, distance: number): Point {
  return { x: point.x + unit.x * distance, y: point.y + unit.y * distance };
}

function unitVector(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return { x: dx / length, y: dy / length };
}

function round(n: number) {
  // One decimal is well under a pixel at any zoom this canvas allows, and
  // keeps the `d` string short enough that re-deriving it on every frame
  // of a drag is not itself the expensive part.
  return Math.round(n * 10) / 10;
}

function polyline(points: Point[]) {
  // Consecutive duplicates are dropped: two nodes that happen to line up
  // on an axis put both elbows of a right-angle route on the same spot,
  // and emitting the same point twice adds a zero-length segment that
  // `stroke-linecap: round` can render as a stray dot.
  const distinct = points.filter(
    (p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.05 || Math.abs(p.y - points[i - 1].y) > 0.05,
  );
  const [head, ...rest] = distinct;
  return `M ${round(head.x)} ${round(head.y)}` + rest.map((p) => ` L ${round(p.x)} ${round(p.y)}`).join("");
}

/**
 * The path from one node's centre to another's, in the given style, with
 * both ends pulled back to the rim of their node.
 *
 * The pull-back is the whole reason this returns a path rather than a
 * plain line between the two centres. An edge drawn centre-to-centre ends
 * *underneath* the target circle, and an `marker-end` arrowhead goes with
 * it — which is how a diagram ends up with no visible sense of direction
 * at all despite every edge carrying an arrow.
 *
 * Returns an empty string for a degenerate edge (two nodes on the same
 * point, or closer together than their own radii), which renders nothing
 * rather than an arrow pointing backwards through itself.
 */
export function edgePath(from: Point, to: Point, style: EdgeStyle, radius: number): string {
  const direct = unitVector(from, to);
  if (!direct) return "";
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span <= radius * 2 + ARROW_GAP) return "";

  if (style === "rectangular") {
    // One elbow, turning on the dominant axis first so the edge leaves
    // its node along the direction it is actually heading rather than
    // doubling back. The mid-point turn keeps the two legs balanced.
    const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const corners: Point[] = horizontalFirst
      ? [{ x: midX, y: from.y }, { x: midX, y: to.y }]
      : [{ x: from.x, y: midY }, { x: to.x, y: midY }];

    // Trim along each end's own leg, not along the straight line between
    // the nodes: the legs are axis-aligned and generally point somewhere
    // else entirely, so trimming along the chord would leave the ends
    // floating off the route.
    const outward = unitVector(from, corners[0]) ?? direct;
    const inward = unitVector(corners[1], to) ?? direct;
    const start = step(from, outward, radius);
    const end = step(to, inward, -(radius + ARROW_GAP));
    return polyline([start, ...corners, end]);
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
