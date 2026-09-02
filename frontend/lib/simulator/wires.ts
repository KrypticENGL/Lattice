/**
 * Turning "this field points at that object" into a line that can be
 * followed by eye.
 *
 * Shared by the live memory panel, which measures its rectangles out of
 * the DOM after paint, and by lib/simulator/panel-image.ts, which
 * computes them. Both hand the same shapes in and get the same paths
 * back, so a saved drawing and the panel it came from route their wires
 * identically — the panel is not a different picture of the program just
 * because one of them did arithmetic the other didn't.
 *
 * ## The two things that made the old drawing unreadable
 *
 * **Wires through cards.** Every wire was the same flat cubic from the
 * source's right edge to the target's left edge, whatever was in between.
 * With lib/simulator/layout.ts placing objects in columns most pointers
 * now hop one column and that curve is exactly right — it stays in the
 * gap between two columns. But the ones that don't hop forward (a `prev`
 * in a doubly-linked list, the back edge of a cycle, a `curr` pointing
 * into the middle of a band) still ran straight through whatever cards
 * sat between the ends. Those are detected here, by testing the line
 * against the cards, and sent the long way round instead.
 *
 * The long way is drawn along the parts of the diagram that are known to
 * be empty, rather than curved hopefully across it. A column gap holds no
 * cards at any height and neither does the strip outside a band, so a
 * routed wire leaves its port into the gap beside it, runs along that gap
 * to the lane outside the band, crosses to the gap on the *target's*
 * left, comes back in along it and arrives at the target's left edge like
 * any other pointer. Which lane — above the band or below it — is the
 * only choice left, and it splits by what holds the pointer, so a stack
 * pointer and a field pointer never share one.
 *
 * Every wire therefore arrives at a left edge. That is worth more than a
 * shorter path would be: "the arrow comes in at the left" is one rule for
 * reading the whole picture, where a wire entering a card through its
 * underside has to be traced backwards to work out what it was.
 *
 * **Wires converging on a point.** Every arrow into an object arrived at
 * the exact middle of its left edge. A node with three parents got three
 * arrowheads stacked on the same pixel and three curves that merged some
 * way out from it, so you could see that the object was popular and
 * nothing else. Arrivals are spread along the edge they come in on, which
 * costs nothing and makes them countable.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** One pointer to draw, before it is known where it can go. */
export type WireRequest = {
  key: string;
  /** Where it leaves: a field's port, or a stack pill's right edge. */
  from: Point;
  /** The object holding it, if one does — used to keep a wire from being
   * told it collides with the card it starts inside. */
  owner?: string;
  target: string;
  color: string;
};

export type RoutedWire = {
  key: string;
  path: string;
  color: string;
  owner?: string;
  target: string;
  /** The target is not allocated: drawn as a stub that stops in mid-air,
   * because there is nothing to land on. */
  dangling: boolean;
};

/** Clearance between a routed wire and the band it goes around. */
const LANE_GAP = 12;
/** Spacing between routed wires that share a side, so two of them running
 * the same way stay two lines. */
const LANE_STEP = 9;
/** After this many, lanes start over — past four the stack is deeper than
 * the gap reserved for it and further separation buys nothing. */
const LANES = 4;
/** How far a dangling pointer's stub reaches before stopping. */
const STUB = 26;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A flat cubic: pointers read left to right, so both control points are
 * pushed out sideways and the curve leaves and arrives horizontal however
 * far apart the ends are vertically. */
function directPath(from: Point, to: Point): string {
  const span = Math.abs(to.x - from.x);
  const bow = Math.max(18, Math.min(70, span * 0.45));
  return (
    `M ${round(from.x)} ${round(from.y)} ` +
    `C ${round(from.x + bow)} ${round(from.y)}, ` +
    `${round(to.x - bow)} ${round(to.y)}, ${round(to.x)} ${round(to.y)}`
  );
}

/** How far past its port a routed wire steps before turning — enough to
 * clear the card it is leaving and still be inside the gap beside it. */
const EXIT = 20;
/** The radius a routed wire's corners are turned with. */
const CORNER = 9;

/**
 * A wire that goes the long way: out of the port into the gap beside it,
 * along that gap to the lane outside the band, across, back down the gap
 * on the target's left, and in.
 *
 * Corners rather than one long curve, because the whole point is that
 * every straight of it is somewhere known to be empty. A curve between
 * the same two ends has to be guessed at — push the control points far
 * enough out and it clips the card it was avoiding, keep them close and
 * it cuts the corner through a different one. Five straights with rounded
 * joins are not a guess: the verticals are in column gaps and the
 * horizontal is outside the band, and none of those ever holds a card.
 */
function aroundPath(from: Point, exitX: number, laneY: number, gateX: number, to: Point): string {
  return roundedPath([
    from,
    { x: exitX, y: from.y },
    { x: exitX, y: laneY },
    { x: gateX, y: laneY },
    { x: gateX, y: to.y },
    to,
  ]);
}

/** A polyline with its corners turned, skipping the joins that two equal
 * points would make into a corner with no angle in it. */
function roundedPath(points: Point[]): string {
  const path: Point[] = [];
  for (const point of points) {
    const last = path[path.length - 1];
    if (!last || Math.abs(last.x - point.x) > 0.5 || Math.abs(last.y - point.y) > 0.5) {
      path.push(point);
    }
  }
  if (path.length < 2) return `M ${round(path[0]?.x ?? 0)} ${round(path[0]?.y ?? 0)}`;

  const parts = [`M ${round(path[0].x)} ${round(path[0].y)}`];
  for (let i = 1; i < path.length - 1; i++) {
    const previous = path[i - 1];
    const corner = path[i];
    const next = path[i + 1];
    const radius = Math.min(CORNER, distance(previous, corner) / 2, distance(corner, next) / 2);
    if (radius < 1) {
      parts.push(`L ${round(corner.x)} ${round(corner.y)}`);
      continue;
    }
    const enter = along(corner, previous, radius);
    const leave = along(corner, next, radius);
    parts.push(
      `L ${round(enter.x)} ${round(enter.y)}`,
      `Q ${round(corner.x)} ${round(corner.y)} ${round(leave.x)} ${round(leave.y)}`,
    );
  }
  const end = path[path.length - 1];
  parts.push(`L ${round(end.x)} ${round(end.y)}`);
  return parts.join(" ");
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** `by` pixels from `at` in the direction of `towards`. */
function along(at: Point, towards: Point, by: number): Point {
  const length = distance(at, towards) || 1;
  return {
    x: at.x + ((towards.x - at.x) * by) / length,
    y: at.y + ((towards.y - at.y) * by) / length,
  };
}

function stubPath(from: Point): string {
  return `M ${round(from.x)} ${round(from.y)} h ${STUB}`;
}

/** Does the straight run between two points pass through a card?
 *
 * An approximation of the curve by its chord, which is what the flat
 * cubic above stays close to — it bows sideways, not across. Good enough
 * to answer the only question being asked: is there a card in the way, or
 * is this a clean hop into the next column. */
function blocked(from: Point, to: Point, cards: Rect[]): boolean {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);

  for (const card of cards) {
    if (card.x + card.w <= left || card.x >= right) continue;
    if (card.y + card.h <= top || card.y >= bottom) continue;
    if (segmentHitsRect(from, to, card)) return true;
  }
  return false;
}

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  // Liang–Barsky: clip the segment to the rectangle and see if anything
  // is left of it.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.w - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/** How a wire reaches its target: straight into the left edge across the
 * gap beside it, or the long way round — over the top of the target's
 * band, or under it. All three arrive at the left edge; the difference is
 * how they get to the gap in front of it. */
type Side = "direct" | "over" | "under";

/** Arrivals on one card's left edge, spread so each is its own arrowhead
 * rather than all of them landing on the middle. Kept inside the edge by
 * an inset, and never spread further apart than the edge is long. */
function spread(count: number, start: number, length: number): number[] {
  const inset = Math.min(8, length / 4);
  const from = start + inset;
  const span = Math.max(0, length - inset * 2);
  if (count <= 1) return [from + span / 2];
  return Array.from({ length: count }, (_, i) => from + (span * i) / (count - 1));
}

/**
 * @param cards     Every allocated object's rectangle, keyed by address.
 * @param bands     One rectangle per band of columns (lib/simulator/layout.ts).
 *                  A routed wire runs in a lane outside the target's
 *                  band; with none given there is one band, everything.
 * @param bounds    The whole diagram, used when there are no bands.
 * @param overhead  Which way round a wire goes when it stays inside one
 *                  band: stack pointers over the top, heap pointers
 *                  underneath, so the two kinds never share a lane.
 */
export function routeWires(
  requests: WireRequest[],
  cards: Map<string, Rect>,
  bands: Rect[],
  bounds: Rect,
  overhead: (request: WireRequest) => boolean,
): RoutedWire[] {
  const obstacles = [...cards.entries()];
  const lanes = bands.length > 0 ? bands : [bounds];

  /** Which band a y falls in. Used both to tell a wire that stays inside
   * one band from one that crosses into another, and to place the lane a
   * routed wire runs in. */
  const bandAt = (y: number): number => {
    for (let i = 0; i < lanes.length; i++) {
      if (y <= lanes[i].y + lanes[i].h + 1) return i;
    }
    return lanes.length - 1;
  };

  // First pass: decide how each wire gets there. Judged against the
  // card's centre, before any spreading, so every wire into one card is
  // decided the same way and they can then be spread as a group.
  type Planned = WireRequest & { side: Side; rect: Rect; band: number };
  const planned: Planned[] = [];
  const stubs: RoutedWire[] = [];

  for (const request of requests) {
    const rect = cards.get(request.target);
    if (!rect) {
      stubs.push({ ...request, path: stubPath(request.from), dangling: true });
      continue;
    }

    const entry = { x: rect.x, y: rect.y + rect.h / 2 };
    const others = obstacles
      .filter(([address]) => address !== request.target && address !== request.owner)
      .map(([, card]) => card);

    const band = bandAt(rect.y + rect.h / 2);
    const forward = entry.x > request.from.x + 6;

    // A wire that can reach the target's left edge without crossing a
    // card takes it — that is the hop into the next column, and it is
    // what the column layout exists to make the common case.
    //
    // The rest go round, and which way is a question about where they
    // started. One crossing from a band above goes over the top of the
    // target's band whatever holds it, because it is already coming
    // down: the wrap from the end of one band to the start of the next
    // is a descent, and sending it under the band it is descending into
    // would run it the length of the drawing first. Only a wire that
    // stays inside one band is free to choose.
    const source = bandAt(request.from.y);
    const side: Side =
      forward && !blocked(request.from, entry, others)
        ? "direct"
        : band > source
          ? "over"
          : band < source
            ? "under"
            : overhead(request)
              ? "over"
              : "under";
    planned.push({ ...request, side, rect, band });
  }

  // Second pass: spread the arrivals that share a card, so a popular
  // object gets one arrowhead per pointer rather than a pile of them on
  // one pixel. Ordered so that the wires coming over the top take the
  // upper slots and the ones from underneath take the lower, and the
  // straight ones sit between them in the order they left — which is the
  // order that keeps them from crossing on the way in.
  const byTarget = new Map<string, Planned[]>();
  for (const wire of planned) {
    byTarget.set(wire.target, [...(byTarget.get(wire.target) ?? []), wire]);
  }

  const rank = (wire: Planned) =>
    wire.side === "over" ? -Infinity : wire.side === "under" ? Infinity : wire.from.y;

  const arrival = new Map<string, Point>();
  for (const group of byTarget.values()) {
    const { rect } = group[0];
    const sorted = [...group].sort((a, b) => rank(a) - rank(b));
    const ys = spread(sorted.length, rect.y, rect.h);
    sorted.forEach((wire, i) => arrival.set(wire.key, { x: rect.x, y: ys[i] }));
  }

  // Lanes, for the wires that go the long way round. Two of them only
  // need to be told apart where they actually run alongside each other,
  // so a lane is reused as soon as it is clear: the first one whose wires
  // all finish before this one starts. A doubly-linked list is a row of
  // `prev` wires each reaching back one column, and that packs them into
  // two lanes instead of fanning them across the page.
  const laneIndex = new Map<string, number>();
  const gateOf = (wire: Planned) => wire.rect.x - COLUMN_GAP / 2;

  for (const side of ["over", "under"] as const) {
    const taken: { from: number; to: number }[][] = [];
    const routed = planned
      .filter((wire) => wire.side === side)
      .map((wire) => {
        const exit = wire.from.x + EXIT;
        const gate = gateOf(wire);
        return { wire, span: { from: Math.min(exit, gate), to: Math.max(exit, gate) } };
      })
      // Widest first, so the wire with the most to clear picks its lane
      // before the short ones start filling them in.
      .sort((a, b) => b.span.to - b.span.from - (a.span.to - a.span.from));

    for (const { wire, span } of routed) {
      let lane = taken.findIndex((used) =>
        used.every((other) => other.to <= span.from || other.from >= span.to),
      );
      if (lane === -1) {
        lane = taken.length;
        taken.push([]);
      }
      taken[lane].push(span);
      laneIndex.set(wire.key, lane % LANES);
    }
  }

  const wires: RoutedWire[] = planned.map((wire) => {
    const to = arrival.get(wire.key)!;
    if (wire.side === "direct") {
      return { ...wire, path: directPath(wire.from, to), dangling: false };
    }
    // Just outside the *target's* band, on the side the wire comes round
    // from — the one strip of the drawing guaranteed to be clear of the
    // cards it is about to land among.
    const band = lanes[wire.band];
    const step = (laneIndex.get(wire.key) ?? 0) * LANE_STEP;
    const laneY =
      wire.side === "over" ? band.y - LANE_GAP - step : band.y + band.h + LANE_GAP + step;
    return {
      ...wire,
      path: aroundPath(wire.from, wire.from.x + EXIT, laneY, gateOf(wire), to),
      dangling: false,
    };
  });

  return [...wires, ...stubs];
}

/* ------------------------------------------------------------------ */
/* The room the router needs                                           */
/* ------------------------------------------------------------------ */

/* Spacing is the router's, not the layout's. A column gap that looks
 * generous and a band gap that looks tidy are the difference between a
 * wire that curves through open space and one that is drawn on top of a
 * card, so both drawings take these numbers from here rather than each
 * picking whatever its own units made convenient. */

/** How much room the lanes need outside a band. */
export const LANE_ROOM = LANE_GAP + LANE_STEP * (LANES - 1) + 6;
/** Between two columns of cards — where a forward wire's curve lives. */
export const COLUMN_GAP = 48;
/** Between two bands. Two sets of lanes share it: the wires that go under
 * one band and the ones that come over the top of the next. */
export const BAND_GAP = LANE_ROOM * 2;
