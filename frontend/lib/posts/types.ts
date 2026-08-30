import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import type { CanvasGraph } from "@/lib/code-canvas/graph";
import type { Diagram } from "@/lib/shape-detection";

/**
 * The canvas a post is built around.
 *
 * A post on this page is never just prose — it exists because somebody
 * traced something and wants to show it, so the canvas is the headline
 * and the writing is the caption. That is why `diagram` is a `Diagram`
 * straight out of `lib/shape-detection` rather than a screenshot: it is
 * the exact structure the Visualizer renders, so the preview is the real
 * drawing at a smaller size and not a picture of one that has since gone
 * stale.
 */
export type CanvasAttachment = {
  /** The canvas this was traced on. Links through to the Visualizer. */
  canvasId: string;
  name: string;
  language: Language;
  /** Which moment of the run is on show — posts pick a step, not a whole
   * trace, because the interesting frame is almost never the last one. */
  stepLabel: string;
  diagram: Diagram;
  /** The Code-Canvas graph the author built, as opposed to `diagram`, which
   * is what one step of running it looked like. Carried so the post can hand
   * over a `.lattice` file — a reader who wants to try the thing needs the
   * blocks, and a diagram cannot be edited back into them. */
  graph: CanvasGraph;
};

export type PostComment = {
  id: string;
  author: string;
  body: string;
  /** Seeded comments carry a pre-rendered relative label, because there is
   * no real date behind them to derive one from. */
  at?: string;
  /** Comments the reader writes carry an actual timestamp instead, and are
   * formatted at render by `commentAge`. Storing "Just now" would have been
   * simpler and would have been a lie the moment the page was reloaded.
   * These only ever exist client-side, so formatting a relative time during
   * render is safe here in a way it would not be for seeded content. */
  createdAt?: number;
  /** Marks a comment this browser wrote, so it can be styled as yours and
   * deleted again. Seeded comments belong to other people and cannot be. */
  mine?: boolean;
};

export type Post = {
  id: string;
  title: string;
  /** One or more paragraphs. Kept as an array rather than a blob with
   * newlines in it so the card can show the first one as the preview and
   * the expanded view can render the rest without re-splitting a string. */
  body: string[];
  author: string;
  handle: string;
  publishedAt: string;
  readTime: string;
  tags: string[];
  /** The post's colour, used for the tag pills and the canvas preview's
   * wash. Drawn from the same orange family as the diagram palette so a
   * feed of posts never turns into a colour wheel. */
  accent: string;
  canvas: CanvasAttachment;
  /** Everyone else's likes. The viewer's own is tracked separately in
   * `use-posts.ts` and added on top, so un-liking can never take the
   * count below what the rest of the world contributed. */
  likes: number;
  comments: PostComment[];
};
