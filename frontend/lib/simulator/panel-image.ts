/**
 * The Simulator's two diagrams, as pictures you can save.
 *
 * The call stack and the memory graph are the two panels worth taking out
 * of the app — into a bug report, a set of notes, a message to someone
 * who is not looking at your screen — and what makes them worth taking is
 * that they are drawings. So they leave as drawings.
 *
 * ## Redrawn, not screenshotted
 *
 * Nothing here reads the DOM. The panels are rendered a second time, from
 * the same `frames` and `heap` the components are given, into a
 * standalone SVG. That is more code than rasterising the live nodes would
 * be, and it buys three things worth the difference: it needs no
 * dependency and no `foreignObject`, it is unaffected by how far the
 * panel happens to be scrolled or how narrow the window is, and it is
 * pure — the same step always produces the same bytes.
 *
 * ## The standing rule for a picture that leaves the app
 *
 * Exactly the one lib/lattice-file/preview.ts sets, for the same reason:
 * the output has to stand on its own. It will be opened by a browser tab,
 * an image viewer, a chat client. So no CSS custom properties (`var(--x)`
 * renders as *nothing* outside this document), no stylesheet, no webfont,
 * no external asset. Every colour is a literal and the font is a stack
 * every platform can satisfy.
 *
 * ## SVG, not a raster
 *
 * These drawings are not a fixed size. A stack twenty frames deep with
 * every local listed, or a heap with fifty objects on it, is a document
 * that is mostly *tall* — and a PNG of one is either enormous or
 * unreadable, with no setting that is right for both a three-frame stack
 * and a thirty-frame one. SVG has no such choice to get wrong: the file
 * is the same size either way, it stays sharp at any zoom, and the text
 * in it is still text, so a value can be selected and copied out of an
 * exported drawing.
 */

import type { Frame, HeapObject, StepEvent, TraceValue } from "@/lib/trace-schema/types";
import { escapeXml } from "@/lib/lattice-file/preview";
import { heapPointers, mentionedAddresses, slotAddresses, stackPointers } from "./pointers";
import { layoutColumns, layoutHeap } from "./layout";
import { BAND_GAP, COLUMN_GAP, LANE_ROOM, routeWires, type Rect, type WireRequest } from "./wires";
import {
  HEAP_PALETTE,
  KIND_COLOR,
  addressLabels,
  isRef,
  isStruct,
  scalarText,
  slotLabels,
  typeLabel,
  valueKind,
} from "./values";

/** How an address is written in one drawing. Chosen from the whole set of
 * addresses the drawing mentions rather than per address — see
 * `addressLabels` for why a fixed truncation cannot be relied on. */
type LabelOf = (address: string) => string;

function labeller(frames: Frame[], heap: Record<string, HeapObject>): LabelOf {
  const labels = addressLabels(mentionedAddresses(frames, heap));
  return (address) => labels.get(address) ?? address;
}

/** A rendered drawing: a complete `<svg>` document and the size it
 * declares, which is also the size it rasterises at before scaling. */
export type PanelImage = {
  source: string;
  width: number;
  height: number;
};

/** `:root` in globals.css, frozen. A picture is a snapshot; it keeps the
 * colours it was made with rather than following the app if the theme
 * later moves. */
const INK = {
  background: "#0d1117",
  surface: "#161b22",
  elevated: "#21262d",
  hairline: "rgba(230, 237, 243, 0.12)",
  hairlineStrong: "rgba(230, 237, 243, 0.22)",
  text: "#e6edf3",
  muted: "#7d8590",
  accent: "#e0824d",
  accentSoft: "#f2a65a",
  danger: "#f87171",
} as const;

/** The palettes in values.ts are written for the browser, where some
 * entries are custom properties. Outside the app those resolve to
 * nothing, so they are mapped back to the literals `:root` gives them. */
const CSS_VARIABLE_COLORS: Record<string, string> = {
  "var(--accent-primary)": INK.accent,
  "var(--accent-secondary)": INK.accentSoft,
  "var(--text-primary)": INK.text,
  "var(--text-secondary)": INK.muted,
  "var(--bg-base)": INK.background,
  "var(--hairline-strong)": INK.hairlineStrong,
};

function resolve(color: string): string {
  return CSS_VARIABLE_COLORS[color] ?? (color.startsWith("var(") ? INK.muted : color);
}

const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
/** Average advance of the font stack above at 1px, close enough to clamp
 * a label to a box without measuring anything. */
const CHAR_WIDTH = 0.62;

const PAD = 16;
const HEADER_H = 30;

function clamp(text: string, maxWidth: number, fontSize: number): string {
  const max = Math.max(3, Math.floor(maxWidth / (fontSize * CHAR_WIDTH)));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

type TextOptions = {
  size?: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  /** Letter spacing in px, for the uppercase micro-labels. */
  tracking?: number;
};

function text(value: string, x: number, y: number, options: TextOptions = {}): string {
  const { size = 11, fill = INK.text, weight, anchor, tracking } = options;
  return (
    `<text x="${round(x)}" y="${round(y)}" fill="${fill}" font-family="${FONT}" font-size="${size}"` +
    (weight ? ` font-weight="${weight}"` : "") +
    (anchor ? ` text-anchor="${anchor}"` : "") +
    (tracking ? ` letter-spacing="${tracking}"` : "") +
    ` dominant-baseline="central">${escapeXml(value)}</text>`
  );
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill?: string; stroke?: string; radius?: number } = {},
): string {
  const { fill = "none", stroke, radius = 0 } = options;
  return (
    `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="${fill}"` +
    (stroke ? ` stroke="${stroke}"` : "") +
    `/>`
  );
}

/** The card every drawing sits in: the panel's own shell, painted rather
 * than blurred — `backdrop-filter` has nothing to sample in a file. */
function shell(width: number, height: number, label: string, hint: string, body: string): PanelImage {
  return {
    width,
    height,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><marker id="sim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>` +
      rect(0, 0, width, height, { fill: INK.background }) +
      rect(0.5, 0.5, width - 1, height - 1, { fill: INK.surface, stroke: INK.hairline, radius: 12 }) +
      rect(0.5, 0.5, width - 1, HEADER_H, { fill: INK.elevated, radius: 12 }) +
      // Square off the header's bottom corners, which the rounded rect
      // above would otherwise curve away from the rule under it.
      rect(0.5, HEADER_H - 12, width - 1, 12, { fill: INK.elevated }) +
      `<path d="M 0.5 ${HEADER_H + 0.5} H ${width - 0.5}" stroke="${INK.hairline}"/>` +
      text(label.toUpperCase(), PAD, HEADER_H / 2, { size: 9, fill: INK.muted, tracking: 1.6 }) +
      text(hint.toUpperCase(), width - PAD, HEADER_H / 2, {
        size: 9,
        fill: INK.muted,
        tracking: 1,
        anchor: "end",
      }) +
      body +
      `</svg>`,
  };
}

/* ------------------------------------------------------------------ */
/* Call stack                                                          */
/* ------------------------------------------------------------------ */

const STACK_WIDTH = 560;
const FRAME_X = PAD;
const FRAME_HEADER_H = 24;
const LOCAL_H = 18;
const FRAME_GAP = 10;

/** The three columns inside a frame, offset from the card's left edge —
 * the Variables panel's own name / type / value split, at the same
 * proportions. */
const NAME_X = 10;
const TYPE_X = 122;
const VALUE_X = 176;

/** The width the slot column takes when the trace has addresses to put in
 * it, and the room it leaves for one.
 *
 * Added to the drawing's width rather than taken out of the columns
 * beside it: those three are already the Variables panel's proportions,
 * and squeezing a name into half its column so an address can sit beside
 * it would trade a fact the reader had for one they didn't ask for. A
 * drawing that is 56px wider costs nothing — see the file header on why
 * these are SVG and not a fixed raster. */
const SLOT_X = 10;
const SLOT_W = 56;

/**
 * The stack, with everything on it.
 *
 * Not the panel. The panel is a list of frame *names* — it is one half of
 * a pair, and the other half is the Variables panel beside it, which
 * shows the locals of whichever single frame you have selected. A picture
 * of the panel alone would therefore export the least interesting thing
 * on the screen: that `push` was called from `main`, and nothing about
 * what either of them was holding at the time.
 *
 * So this draws what you would get by clicking every frame in turn and
 * writing down what appeared: each frame, and under it every local it
 * holds with its type and its value. That is what makes an exported stack
 * worth keeping — it is the state, not the shape.
 *
 * Pointer values are drawn as the address they hold and nothing more.
 * Whether that address is still allocated is a question about the heap,
 * and the heap is the other drawing's subject; this one would have to be
 * handed a heap it otherwise has no use for in order to answer it.
 */
export function renderCallStackImage(frames: Frame[], event: StepEvent["event"] | null): PanelImage {
  const labelOf = labeller(frames, {});
  const top = frames.length - 1;
  // Innermost first, the way the panel stacks them and the way a stack
  // trace is read.
  const rows = frames.map((frame, depth) => ({ frame, depth })).reverse();
  const totalLocals = frames.reduce((n, frame) => n + Object.keys(frame.locals).length, 0);
  const bodyTop = HEADER_H + PAD * 0.75;

  // Where each local lives, if this trace says. Labelled as its own set,
  // never pooled with the heap's — see `slotAddresses`. A trace recorded
  // before the tracer reported slots has none, and then the drawing is
  // exactly the one it always was, down to its width.
  const slots = slotLabels(slotAddresses(frames));
  const slotW = slots.size > 0 ? SLOT_W : 0;
  const width = STACK_WIDTH + slotW;
  const frameW = width - PAD * 2;
  const nameX = NAME_X + slotW;
  const typeX = TYPE_X + slotW;
  const valueX = VALUE_X + slotW;
  const valueW = frameW - 10 - valueX;

  if (rows.length === 0) {
    return shell(
      STACK_WIDTH,
      120,
      "Call stack",
      "",
      text("Frames appear here as functions are called.", STACK_WIDTH / 2, 78, {
        size: 11,
        fill: INK.muted,
        anchor: "middle",
      }),
    );
  }

  const blocks = rows.map(({ frame, depth }) => {
    const names = Object.keys(frame.locals);
    // A frame with nothing in scope still gets one row, so it reads as an
    // answered question rather than a card that was cut off.
    const bodyH = Math.max(1, names.length) * LOCAL_H;
    return { frame, depth, names, height: FRAME_HEADER_H + bodyH };
  });

  const height =
    bodyTop +
    blocks.reduce((sum, block) => sum + block.height, 0) +
    (blocks.length - 1) * FRAME_GAP +
    PAD +
    16;

  const parts: string[] = [];
  let y = bodyTop;

  for (const block of blocks) {
    const isTop = block.depth === top;
    const accent = isTop ? INK.accent : INK.muted;

    parts.push(
      rect(FRAME_X, y, frameW, block.height, {
        fill: INK.surface,
        stroke: isTop ? INK.hairlineStrong : INK.hairline,
        radius: 8,
      }),
      // The header carries the frame's own tint, heavier on the frame
      // that is actually executing.
      `<path d="M ${FRAME_X} ${round(y + 8)} a 8 8 0 0 1 8 -8 h ${frameW - 16} a 8 8 0 0 1 8 8 v ${FRAME_HEADER_H - 8} h -${frameW} z" fill="${accent}" opacity="${isTop ? 0.2 : 0.1}"/>`,
    );

    const headerMid = y + FRAME_HEADER_H / 2;
    parts.push(
      `<circle cx="${FRAME_X + 19}" cy="${round(headerMid)}" r="8" fill="${isTop ? INK.accent : INK.elevated}"${isTop ? "" : ` stroke="${INK.hairline}"`}/>`,
      text(String(block.depth), FRAME_X + 19, headerMid, {
        size: 8,
        fill: isTop ? INK.background : INK.muted,
        anchor: "middle",
      }),
    );

    const countText = `${block.names.length}v`;
    const countX = FRAME_X + frameW - 10;
    const tag = isTop ? (event === "return" ? "returning" : "running") : null;
    const tagW = tag ? tag.length * 8 * CHAR_WIDTH + 14 : 0;
    const tagX = countX - countText.length * 9 * CHAR_WIDTH - 10 - tagW;

    parts.push(
      text(clamp(`${block.frame.function}()`, (tag ? tagX : countX) - (FRAME_X + 33) - 8, 11), FRAME_X + 33, headerMid, {
        size: 11,
        fill: isTop ? INK.text : INK.muted,
      }),
      text(countText, countX, headerMid, { size: 9, fill: INK.muted, anchor: "end" }),
    );

    if (tag) {
      parts.push(
        rect(tagX, headerMid - 8, tagW, 16, { fill: "#4a2f1f", radius: 8 }),
        text(tag.toUpperCase(), tagX + tagW / 2, headerMid, {
          size: 8,
          fill: INK.accentSoft,
          anchor: "middle",
          tracking: 0.8,
        }),
      );
    }

    if (block.names.length === 0) {
      parts.push(
        text("no locals in scope yet", FRAME_X + nameX, y + FRAME_HEADER_H + LOCAL_H / 2, {
          size: 9,
          fill: INK.muted,
        }),
      );
    }

    block.names.forEach((name, row) => {
      const rowY = y + FRAME_HEADER_H + row * LOCAL_H;
      const mid = rowY + LOCAL_H / 2;
      const value = block.frame.locals[name];

      if (row > 0) {
        parts.push(`<path d="M ${FRAME_X} ${round(rowY)} H ${FRAME_X + frameW}" stroke="${INK.hairline}"/>`);
      }

      // Where this one lives, when the trace says. A local the compiler
      // kept in a register has no address and gets the same dash the
      // panel gives it, so a reader can tell "not reported" apart from
      // "not shown here".
      if (slotW) {
        const address = block.frame.addrs?.[name];
        parts.push(
          text(address ? (slots.get(address) ?? address) : "—", FRAME_X + SLOT_X, mid, {
            size: 9,
            fill: INK.muted,
          }),
        );
      }

      parts.push(
        text(clamp(name, typeX - nameX - 8, 10), FRAME_X + nameX, mid, { size: 10, fill: INK.text }),
        text(clamp(typeLabel(value), valueX - typeX - 8, 8).toUpperCase(), FRAME_X + typeX, mid, {
          size: 8,
          fill: INK.muted,
          tracking: 0.6,
        }),
        ...valueMarkup(value, FRAME_X + valueX, mid, valueW, labelOf),
      );
    });

    y += block.height + FRAME_GAP;
  }

  parts.push(
    text("stack base", FRAME_X + 8, y - FRAME_GAP + 18, { size: 8, fill: INK.muted, tracking: 1.6 }),
  );

  return shell(
    width,
    height,
    "Call stack",
    `depth ${frames.length} · ${totalLocals} vars`,
    parts.join(""),
  );
}

/**
 * One local's value, drawn by shape rather than stringified — the same
 * six cases the Variables panel splits, since a value that is a pointer
 * and a value that is the string `"0x1"` should not look alike.
 *
 * Everything is laid out left to right from `x` and clipped by `width`:
 * an array that would run past the column stops and says how many cells
 * it did not draw, rather than spilling over the card's edge. That is the
 * one thing a fixed-width drawing has to get right, because unlike the
 * panel it cannot be scrolled sideways.
 */
function valueMarkup(
  value: TraceValue,
  x: number,
  mid: number,
  width: number,
  labelOf: LabelOf,
): string[] {
  if (isRef(value)) {
    const label = labelOf(value.ref);
    const w = label.length * 10 * CHAR_WIDTH + 26;
    return [
      rect(x, mid - 8, Math.min(w, width), 16, {
        fill: INK.elevated,
        stroke: INK.hairline,
        radius: 8,
      }),
      text(label, x + 9, mid, { size: 10, fill: INK.accent }),
      `<path d="M ${round(x + w - 17)} ${round(mid)} h 7 m -2.5 -2.5 l 2.5 2.5 l -2.5 2.5" fill="none" stroke="${INK.accent}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    ];
  }

  if (Array.isArray(value)) {
    const parts: string[] = [];
    let cursor = x;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const label = isRef(item) ? labelOf(item.ref) : scalarText(item);
      const cellW = label.length * 10 * CHAR_WIDTH + 12;
      // Leave room for the "+N" that says what was left out.
      if (cursor + cellW > x + width - 28) {
        parts.push(
          text(`+${value.length - i}`, cursor + 4, mid, { size: 9, fill: INK.muted }),
        );
        break;
      }
      parts.push(
        rect(cursor, mid - 8, cellW, 16, { fill: INK.elevated, stroke: INK.hairline }),
        text(label, cursor + cellW / 2, mid, {
          size: 10,
          fill: isRef(item) ? INK.accent : resolve(KIND_COLOR[valueKind(item)]),
          anchor: "middle",
        }),
      );
      cursor += cellW + 1;
    }
    return parts;
  }

  if (isStruct(value)) {
    const fields = Object.keys(value.fields)
      .map((key) => `${key}: ${isRef(value.fields[key]) ? "ptr" : scalarText(value.fields[key])}`)
      .join(", ");
    return [
      text(clamp(`${value.type} { ${fields} }`, width, 10), x, mid, { size: 10, fill: INK.muted }),
    ];
  }

  return [
    text(clamp(scalarText(value), width, 10), x, mid, {
      size: 10,
      fill: resolve(KIND_COLOR[valueKind(value)]),
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Memory & pointers                                                   */
/* ------------------------------------------------------------------ */

const LANE_W = 158;
const LANE_GAP = 44;
const CARD_W = 190;
const PILL_H = 18;
const PILL_GAP = 8;
const CARD_HEADER_H = 20;
const FIELD_H = 17;
const CARD_GAP = 12;
/** What an empty diagram is drawn at — a single column's worth, so the
 * "nothing allocated yet" card is not a strip of empty page. */
const MEMORY_MIN_WIDTH = PAD + LANE_W + LANE_GAP + CARD_W + PAD;

function fieldText(value: TraceValue, labelOf: LabelOf): { label: string; color: string } {
  if (isRef(value)) return { label: labelOf(value.ref), color: resolve(KIND_COLOR.ref) };
  if (Array.isArray(value)) return { label: `[${value.length}]`, color: INK.muted };
  if (typeof value === "object" && value !== null) return { label: "{…}", color: INK.muted };
  return { label: scalarText(value), color: resolve(KIND_COLOR[valueKind(value)]) };
}

function cardHeight(object: HeapObject): number {
  return CARD_HEADER_H + Object.keys(object.fields).length * FIELD_H;
}

/**
 * The memory diagram: pointers on the left, the heap on the right, and a
 * drawn line for every one that leads somewhere.
 *
 * The live panel measures its rectangles after paint because a card's
 * height depends on the font it was rendered in. Here they are arithmetic
 * — but they are arithmetic over the *same* placement, from
 * lib/simulator/layout.ts, and the wires between them are routed by the
 * same lib/simulator/wires.ts. That is the whole point of those two files
 * being files: this drawing and the panel it came from cannot arrange one
 * heap two different ways.
 */
export function renderMemoryImage(frames: Frame[], heap: Record<string, HeapObject>): PanelImage {
  const lane = stackPointers(frames);
  const ports = heapPointers(heap);
  const addresses = Object.keys(heap);
  const labelOf = labeller(frames, heap);
  const hint = `${addresses.length} on heap · ${lane.length} ptr`;

  const layout = layoutHeap(heap);
  const columns = Math.max(1, layoutColumns(layout));
  const width = PAD + LANE_W + LANE_GAP + columns * (CARD_W + COLUMN_GAP) - COLUMN_GAP + PAD;

  if (addresses.length === 0 && lane.length === 0) {
    return shell(
      MEMORY_MIN_WIDTH,
      140,
      "Memory & pointers",
      hint,
      text("Nothing allocated yet.", MEMORY_MIN_WIDTH / 2, 88, {
        size: 11,
        fill: INK.muted,
        anchor: "middle",
      }),
    );
  }

  const bodyTop = HEADER_H + PAD * 0.75;
  const laneX = PAD;
  const heapX = PAD + LANE_W + LANE_GAP;
  // Room above the first band for the wires that go over the top of it.
  const columnTop = bodyTop + 16 + LANE_ROOM;

  /** Where each pill sits, keyed the way `stackPointers` keys them. */
  const pillAt = new Map<string, { x: number; y: number; w: number }>();
  lane.forEach((pointer, i) => {
    const label = `${pointer.frame}::${pointer.name} ${labelOf(pointer.address)}`;
    const w = Math.min(LANE_W, label.length * 10 * CHAR_WIDTH + 22);
    pillAt.set(pointer.key, { x: laneX, y: columnTop + i * (PILL_H + PILL_GAP), w });
  });

  /** Every card's box, and every band's, laid out band by band down the
   * page and column by column across it. */
  const cardAt = new Map<string, Rect>();
  const bands: Rect[] = [];
  let bandTop = columnTop;
  for (const band of layout.bands) {
    let tallest = 0;
    band.forEach((column, index) => {
      const x = heapX + index * (CARD_W + COLUMN_GAP);
      let y = bandTop;
      for (const address of column) {
        const h = cardHeight(heap[address]);
        cardAt.set(address, { x, y, w: CARD_W, h });
        y += h + CARD_GAP;
      }
      tallest = Math.max(tallest, y - CARD_GAP - bandTop);
    });
    bands.push({
      x: heapX,
      y: bandTop,
      w: band.length * (CARD_W + COLUMN_GAP) - COLUMN_GAP,
      h: tallest,
    });
    bandTop += tallest + BAND_GAP;
  }

  const heapBottom = bands.length > 0 ? bandTop - BAND_GAP + LANE_ROOM : columnTop;
  const laneBottom = columnTop + lane.length * (PILL_H + PILL_GAP);
  const height = Math.max(140, Math.max(heapBottom, laneBottom) + PAD);

  const parts: string[] = [];

  parts.push(
    text("Stack", laneX, bodyTop + 2, { size: 8, fill: INK.muted, tracking: 1.6 }),
    text("Heap", heapX, bodyTop + 2, { size: 8, fill: INK.muted, tracking: 1.6 }),
  );

  // Wires first, so the cards and pills sit on top of them exactly as the
  // live panel stacks its SVG under its grid.
  const requests: WireRequest[] = [];
  for (const pointer of lane) {
    const pill = pillAt.get(pointer.key);
    if (!pill) continue;
    requests.push({
      key: pointer.key,
      from: { x: pill.x + pill.w, y: pill.y + PILL_H / 2 },
      target: pointer.address,
      color: INK.muted,
    });
  }
  for (const pointer of ports) {
    const card = cardAt.get(pointer.address);
    if (!card) continue;
    const row = Object.keys(heap[pointer.address].fields).indexOf(pointer.field);
    requests.push({
      key: pointer.key,
      from: {
        x: card.x + CARD_W - 6,
        y: card.y + CARD_HEADER_H + row * FIELD_H + FIELD_H / 2,
      },
      owner: pointer.address,
      target: pointer.target,
      color: resolve(HEAP_PALETTE[pointer.index % HEAP_PALETTE.length]),
    });
  }

  // Stack pointers go over the top of a band, heap pointers underneath,
  // so the two kinds never share a lane.
  for (const wire of routeWires(
    requests,
    cardAt,
    bands,
    { x: 0, y: 0, w: width, h: height },
    (request) => !request.owner,
  )) {
    parts.push(
      `<path d="${wire.path}" fill="none" stroke="${wire.dangling ? INK.danger : wire.color}"` +
        ` stroke-width="1.4" stroke-linecap="round" opacity="0.85"` +
        (wire.dangling ? ` stroke-dasharray="3 3"/>` : ` marker-end="url(#sim-arrow)"/>`),
    );
  }

  for (const pointer of lane) {
    const pill = pillAt.get(pointer.key);
    if (!pill) continue;
    const dangling = !(pointer.address in heap);
    const color = dangling ? INK.danger : INK.accent;
    parts.push(
      rect(pill.x, pill.y, pill.w, PILL_H, {
        fill: INK.elevated,
        stroke: INK.hairline,
        radius: PILL_H / 2,
      }),
      text(
        clamp(`${pointer.frame}::${pointer.name}`, pill.w * 0.58, 10),
        pill.x + 9,
        pill.y + PILL_H / 2,
        { size: 10, fill: INK.text },
      ),
      text(labelOf(pointer.address), pill.x + pill.w - 9, pill.y + PILL_H / 2, {
        size: 10,
        fill: color,
        anchor: "end",
      }),
    );
  }

  addresses.forEach((address, index) => {
    const card = cardAt.get(address);
    if (!card) return;
    const object = heap[address];
    const color = resolve(HEAP_PALETTE[index % HEAP_PALETTE.length]);
    const fields = Object.keys(object.fields);

    parts.push(
      rect(card.x, card.y, CARD_W, card.h, { fill: INK.surface, stroke: INK.hairline, radius: 8 }),
      // The header carries the object's colour, at the same weight the
      // live card tints it with (`color-mix … 18%`).
      `<path d="M ${round(card.x)} ${round(card.y + 8)} a 8 8 0 0 1 8 -8 h ${CARD_W - 16} a 8 8 0 0 1 8 8 v ${CARD_HEADER_H - 8} h -${CARD_W} z" fill="${color}" opacity="0.18"/>`,
      text(clamp(object.type, CARD_W * 0.55, 10), card.x + 9, card.y + CARD_HEADER_H / 2, {
        size: 10,
        fill: color,
        weight: 500,
      }),
      text(labelOf(address), card.x + CARD_W - 9, card.y + CARD_HEADER_H / 2, {
        size: 9,
        fill: INK.muted,
        anchor: "end",
      }),
    );

    fields.forEach((field, row) => {
      const y = card.y + CARD_HEADER_H + row * FIELD_H;
      const mid = y + FIELD_H / 2;
      const value = fieldText(object.fields[field], labelOf);
      if (row > 0) {
        parts.push(
          `<path d="M ${round(card.x)} ${round(y)} H ${round(card.x + CARD_W)}" stroke="${INK.hairline}"/>`,
        );
      }
      parts.push(
        text(clamp(field, 52, 9), card.x + 9, mid, { size: 9, fill: INK.muted }),
        text(clamp(value.label, CARD_W - 90, 9), card.x + CARD_W - 20, mid, {
          size: 9,
          fill: value.color,
          anchor: "end",
        }),
        // The port an outgoing wire leaves from, drawn for every field so
        // a row's shape doesn't change when a null becomes a pointer.
        `<circle cx="${round(card.x + CARD_W - 9)}" cy="${round(mid)}" r="3" fill="${isRef(object.fields[field]) ? color : INK.hairlineStrong}"/>`,
      );
    });
  });

  return shell(width, height, "Memory & pointers", hint, parts.join(""));
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // The object URL pins the blob until it is revoked, and the click above
  // is synchronous, so it is safe to let go immediately.
  URL.revokeObjectURL(url);
}

/** Saves a drawing as a standalone `.svg`. */
export function downloadPanelImage(image: PanelImage, baseName: string): void {
  save(new Blob([image.source], { type: "image/svg+xml" }), `${baseName}.svg`);
}
