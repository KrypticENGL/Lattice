/**
 * How much room a diagram actually needs.
 *
 * Split out of `CanvasPreview` because two components need the answer and
 * only one of them draws: the preview solves its `viewBox` from it, and
 * the figure around the preview sizes its *frame* from it. Before this
 * existed the frame was a hard `aspect-[16/9]` and the drawing was fitted
 * inside with `xMidYMid meet`, which is fine for a diagram that happens to
 * be 16:9 and is dead space for every other one — measured across the seed
 * posts, four of six drawings covered half their frame or less, and a
 * four-node list covered 41%. The blank space in the feed was mostly
 * *inside* the cards.
 *
 * So the frame follows the drawing instead. A wide list gets a short wide
 * box, a trie gets a tall narrow one, and the letterboxing goes away.
 */

import type { Diagram } from "@/lib/shape-detection";

/** Matches the radius `CanvasPreview` draws nodes at; the box has to
 * clear the circles, not their centres. */
export const NODE_RADIUS = 16;

/* Room around the outermost nodes, in diagram units.
 *
 * Asymmetric, and much tighter than the 34-a-side this replaces. Padding
 * is not neutral: it is added to both axes, so a generous margin drags
 * every aspect ratio towards 1:1 and quietly flattens the difference
 * between a strip and a column — the very thing the frame is now trying
 * to read. Only the top genuinely needs room, for the root marker's ring
 * and the `head`/`root`/`start` label sitting above it. */
const PAD_X = 12;
const PAD_TOP = 26;
const PAD_BOTTOM = 12;

export type PreviewFrame = {
  /** For the SVG. */
  viewBox: string;
  /** Width over height. 1 for an empty diagram, so a caller dividing by
   * it never has to guard. */
  aspect: number;
};

/**
 * The box that holds `diagram`, and its shape.
 *
 * Solved from the content rather than fixed, because these diagrams have
 * no common aspect: a six-node list is a wide strip and a trie is a tall
 * triangle. A fixed box letterboxes one and crops the other.
 */
export function previewFrame(diagram: Diagram): PreviewFrame {
  if (diagram.nodes.length === 0) return { viewBox: "0 0 100 100", aspect: 1 };

  const xs = diagram.nodes.map((n) => n.x);
  const ys = diagram.nodes.map((n) => n.y);

  const minX = Math.min(...xs) - NODE_RADIUS - PAD_X;
  const minY = Math.min(...ys) - NODE_RADIUS - PAD_TOP;
  const width = Math.max(...xs) + NODE_RADIUS + PAD_X - minX;
  const height = Math.max(...ys) + NODE_RADIUS + PAD_BOTTOM - minY;

  return { viewBox: `${minX} ${minY} ${width} ${height}`, aspect: width / height };
}
