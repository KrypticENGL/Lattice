/**
 * The picture that rides inside a `.lattice` file.
 *
 * Rendered from the graph rather than captured from the screen, which
 * makes it deterministic — the same graph always produces the same bytes,
 * so a file committed to git only changes when the work does — and means
 * it can be produced without the canvas being open, mounted, or even
 * scrolled to the right place.
 *
 * The one hard rule here is that the output has to stand on its own. A
 * `.lattice` file gets opened by things that are not this app: a browser
 * tab, a file manager's preview pane, a diff. So nothing may reference a
 * CSS custom property, a stylesheet, a webfont, or an external asset —
 * `var(--accent-primary)` renders as *nothing* outside the app, and a
 * preview with no colour in it is worse than no preview. Every colour is
 * a literal, the background is painted rather than assumed, and the font
 * is a generic stack every platform can satisfy.
 */

import {
  NODE_TYPES,
  findPort,
  nodeSize,
  portPosition,
  wirePath,
  type CanvasGraph,
  type CanvasNode,
} from "@/lib/code-canvas/graph";
import { circleEdgePath } from "@/lib/edge-style";
import type { Diagram } from "@/lib/shape-detection";

/** The app's theme, frozen as literals. These mirror `:root` in
 * globals.css; a preview is a snapshot, so it keeps the colours it was
 * made with rather than following the app if the theme later moves. */
const INK = {
  background: "#0d1117",
  surface: "#161b22",
  header: "#21262d",
  hairline: "rgba(230, 237, 243, 0.14)",
  text: "#e6edf3",
  muted: "#7d8590",
  wire: "#7d8590",
} as const;

/** `NODE_TYPES` accents are written for the browser, where two of them are
 * custom properties. Outside the app those resolve to nothing, so they are
 * mapped back to the literals `:root` gives them. */
const CSS_VARIABLE_COLORS: Record<string, string> = {
  "var(--accent-primary)": "#e0824d",
  "var(--accent-secondary)": "#f2a65a",
};

function resolveColor(color: string): string {
  return CSS_VARIABLE_COLORS[color] ?? (color.startsWith("var(") ? INK.muted : color);
}

/** Padding around the outermost blocks, in graph units. */
const MARGIN = 48;

/** The largest box the preview is allowed to declare. The viewBox carries
 * the graph's real extent, so this caps the *rendered* size without
 * cropping anything — a fifty-block graph comes out small, not clipped. */
const MAX_WIDTH = 960;
const MAX_HEIGHT = 540;

/** Placeholder box for a graph with nothing in it, so `preview` is never
 * absent and a reader never has to special-case it. */
const EMPTY_SIZE = { width: 480, height: 270 };

const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Escapes text bound for an SVG text node or attribute.
 *
 * Every string that reaches here is user input — block names, field
 * values, the graph's title — so this is the boundary that keeps a value
 * like `a < b && c` from turning a preview into malformed XML, or worse
 * into markup of the author's choosing in whatever opens the file.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Keeps a label inside its block. Measured in characters rather than
 * pixels because the font is whatever the opener has; at 11px monospace
 * roughly 6.2px per character is close enough for a thumbnail. */
function clamp(text: string, maxWidth: number): string {
  const maxChars = Math.max(3, Math.floor(maxWidth / 6.2));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type GraphPreview = {
  kind: "svg";
  /** Declared render size. The viewBox holds the graph's true extent. */
  width: number;
  height: number;
  /** A complete, standalone `<svg>` document. */
  source: string;
};

function nodeMarkup(node: CanvasNode): string {
  const spec = NODE_TYPES[node.kind];
  if (!spec) return "";
  const { width, height } = nodeSize(node.kind);
  const accent = resolveColor(spec.accent);

  const parts: string[] = [
    `<rect x="${round(node.x)}" y="${round(node.y)}" width="${width}" height="${height}" rx="8" fill="${INK.surface}" stroke="${INK.hairline}"/>`,
    // The header carries the block's colour. Drawn as a full rounded rect
    // clipped by the body's own rounding would need a clipPath per node;
    // a plain rect plus a rule under it reads the same at this size.
    `<path d="M ${round(node.x)} ${round(node.y + 8)} a 8 8 0 0 1 8 -8 h ${width - 16} a 8 8 0 0 1 8 8 v 24 h -${width} z" fill="${accent}" opacity="0.22"/>`,
    `<text x="${round(node.x + 10)}" y="${round(node.y + 21)}" fill="${accent}" font-family="${FONT}" font-size="11" font-weight="600">${escapeXml(clamp(spec.label, width - 20))}</text>`,
  ];

  let rowY = node.y + 32 + 4;
  for (const field of spec.fields) {
    const value = (node.fields[field.id] ?? "").trim();
    const shown = value || field.placeholder;
    parts.push(
      `<text x="${round(node.x + 10)}" y="${round(rowY + 15)}" fill="${value ? INK.text : INK.muted}" font-family="${FONT}" font-size="10">${escapeXml(clamp(`${field.label}: ${shown}`, width - 20))}</text>`,
    );
    rowY += field.multiline ? 52 : 26;
  }

  return parts.join("");
}

function wireMarkup(graph: CanvasGraph): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const paths: string[] = [];

  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const fromPort = findPort(from.kind, edge.fromPort);
    const toPort = findPort(to.kind, edge.toPort);
    // A port that no longer exists on its block means the graph outlived a
    // change to `NODE_TYPES`. Skipping the wire keeps the rest of the
    // preview truthful rather than drawing a line to the block's corner.
    if (!fromPort || !toPort) continue;

    const a = portPosition(from, fromPort);
    const b = portPosition(to, toPort);
    paths.push(
      // Always curved, regardless of the reader's routing preference: the
      // preview is baked into the file and shared, so it cannot depend on
      // a setting that lives in one person's browser.
      `<path d="${wirePath(a, fromPort.side, b, toPort.side, "curved")}" fill="none" stroke="${INK.wire}" stroke-width="1.6" stroke-linecap="round" opacity="0.65" marker-end="url(#lattice-arrow)"/>`,
    );
  }

  return paths.join("");
}

/**
 * Renders `graph` to a standalone SVG document.
 *
 * Pure: no DOM, no measurement, no `window`. That is what lets the same
 * function run in the browser when the user exports and — should the
 * format ever be written server-side — in Node without changing.
 */
export function renderGraphPreview(graph: CanvasGraph): GraphPreview {
  if (graph.nodes.length === 0) return placeholderPreview("Empty canvas");

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const { width, height } = nodeSize(node.kind);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + width);
    maxY = Math.max(maxY, node.y + height);
  }

  const viewX = round(minX - MARGIN);
  const viewY = round(minY - MARGIN);
  const viewW = round(maxX - minX + MARGIN * 2);
  const viewH = round(maxY - minY + MARGIN * 2);

  // Declared size is the viewBox scaled to fit the cap, so the aspect
  // ratio is the graph's own and nothing is cropped.
  const scale = Math.min(1, MAX_WIDTH / viewW, MAX_HEIGHT / viewH);
  const width = Math.max(1, Math.round(viewW * scale));
  const height = Math.max(1, Math.round(viewH * scale));

  return {
    kind: "svg",
    width,
    height,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${viewW} ${viewH}">` +
      `<defs><marker id="lattice-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${INK.wire}"/></marker></defs>` +
      `<rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="${INK.background}"/>` +
      wireMarkup(graph) +
      graph.nodes.map(nodeMarkup).join("") +
      `</svg>`,
  };
}

/* ------------------------------------------------------------------ */
/* The Visualizer's half                                               */
/* ------------------------------------------------------------------ */

/**
 * The same job for the other kind of drawing in a `.lattice` file.
 *
 * A Code-Canvas graph is a fixed arrangement of blocks; a Visualizer graph
 * is one step of a trace, laid out by `buildDiagram`. Both end up as a bag
 * of positioned things with lines between them, so both get a picture on
 * the same terms as everything above: literal colours, a generic font, no
 * reference to anything outside the file.
 *
 * Mirrors DiagramView deliberately — the same radius, the same six-shade
 * palette indexed the same way, the same six-character label clamp, the
 * same ring and caption on an entry point. A preview that laid the drawing
 * out differently from the app would be a picture of a canvas nobody has.
 */

/** DiagramView's `NODE_RADIUS`. */
const DIAGRAM_NODE_RADIUS = 22;

/** DiagramView's `PALETTE`, with its two custom properties resolved. */
const DIAGRAM_PALETTE = [
  "#f2a65a",
  "#e0824d",
  "#f7b267",
  "#c2703d",
  "#e8993d",
  "#a85c2e",
] as const;

/** DiagramView's `ROOT_LABEL` — what the entry point of each shape is
 * called, so the marker says "head" over a list and "root" over a tree. */
const DIAGRAM_ROOT_LABEL: Record<Diagram["kind"], string> = {
  "linked-list": "head",
  tree: "root",
  graph: "start",
};

/** DiagramView's `MAX_LABEL_LENGTH`. */
const DIAGRAM_MAX_LABEL = 6;

function diagramLabel(label: string): string {
  return label.length > DIAGRAM_MAX_LABEL
    ? `${label.slice(0, DIAGRAM_MAX_LABEL - 1)}…`
    : label;
}

function placeholderPreview(caption: string): GraphPreview {
  const { width, height } = EMPTY_SIZE;
  return {
    kind: "svg",
    width,
    height,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${INK.background}"/>` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${INK.muted}" font-family="${FONT}" font-size="13">${escapeXml(caption)}</text>` +
      `</svg>`,
  };
}

/**
 * Renders one step of a traced structure to a standalone SVG document.
 *
 * Pure, for the same reason `renderGraphPreview` is: the picture in a file
 * has to be reproducible from the file's own contents, with no canvas
 * mounted and no camera to ask.
 */
export function renderDiagramPreview(diagram: Diagram | null): GraphPreview {
  if (!diagram || diagram.nodes.length === 0) {
    return placeholderPreview("Nothing drawn");
  }

  const roots = new Set(diagram.roots);
  // The ring around an entry point and the caption above it both reach
  // further than the circle does, so the extent is measured from what is
  // actually drawn rather than from the node centres.
  const reach = DIAGRAM_NODE_RADIUS + 22;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of diagram.nodes) {
    minX = Math.min(minX, node.x - reach);
    minY = Math.min(minY, node.y - reach);
    maxX = Math.max(maxX, node.x + reach);
    maxY = Math.max(maxY, node.y + reach);
  }

  const viewX = round(minX - MARGIN);
  const viewY = round(minY - MARGIN);
  const viewW = round(maxX - minX + MARGIN * 2);
  const viewH = round(maxY - minY + MARGIN * 2);

  const scale = Math.min(1, MAX_WIDTH / viewW, MAX_HEIGHT / viewH);
  const width = Math.max(1, Math.round(viewW * scale));
  const height = Math.max(1, Math.round(viewH * scale));

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const edges: string[] = [];
  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    // Always curved, for the same reason the Code-Canvas preview is: the
    // reader's routing preference lives in their browser and this file is
    // going to be opened somewhere else.
    const d = circleEdgePath(from, to, "curved", DIAGRAM_NODE_RADIUS);
    if (!d) continue;
    edges.push(
      `<path d="${d}" fill="none" stroke="${INK.wire}" stroke-width="1.6" stroke-linecap="round" opacity="0.7" marker-end="url(#lattice-arrow)"/>`,
    );
  }

  const nodes: string[] = [];
  diagram.nodes.forEach((node, index) => {
    const color = DIAGRAM_PALETTE[index % DIAGRAM_PALETTE.length];
    const x = round(node.x);
    const y = round(node.y);

    if (roots.has(node.id)) {
      nodes.push(
        `<circle cx="${x}" cy="${y}" r="${DIAGRAM_NODE_RADIUS + 6}" fill="none" stroke="${DIAGRAM_PALETTE[1]}" stroke-width="1.5" opacity="0.85"/>`,
        `<text x="${x}" y="${round(node.y - DIAGRAM_NODE_RADIUS - 15)}" text-anchor="middle" fill="${DIAGRAM_PALETTE[1]}" font-family="${FONT}" font-size="9" letter-spacing="1.6">${escapeXml(DIAGRAM_ROOT_LABEL[diagram.kind].toUpperCase())}</text>`,
      );
    }

    nodes.push(
      `<circle cx="${x}" cy="${y}" r="${DIAGRAM_NODE_RADIUS}" fill="${color}"/>`,
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${INK.background}" font-family="${FONT}" font-size="11">${escapeXml(diagramLabel(node.label))}</text>`,
    );
  });

  return {
    kind: "svg",
    width,
    height,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${viewW} ${viewH}">` +
      `<defs><marker id="lattice-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${INK.wire}"/></marker></defs>` +
      `<rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="${INK.background}"/>` +
      edges.join("") +
      nodes.join("") +
      `</svg>`,
  };
}
