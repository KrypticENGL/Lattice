"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CanvasPreview from "./CanvasPreview";
import { downloadLatticeFile, latticeFileName } from "@/lib/posts/lattice";
import { previewFrame } from "@/lib/posts/preview-frame";
import { initials } from "@/lib/posts/use-posts";
import type { Post } from "@/lib/posts/types";

/**
 * The pieces a post is drawn from, shared by the feed card and the post's
 * own page.
 *
 * These two views show the same post at two lengths, and every part they
 * have in common — the byline, the canvas, the tags, the action bar — has
 * to look identical in both or following a card through to its page reads
 * as arriving somewhere else. Keeping one copy of each is what guarantees
 * that; two copies would agree until the first time one of them changed.
 */

export const LANGUAGE_LABEL: Record<Post["canvas"]["language"], string> = {
  cpp: "C++",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  rust: "Rust",
};

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5s-7.5-4.6-7.5-9.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5-7.5 9.6-7.5 9.6z" />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 4.5H4a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h3.5V21l4-4.5H20a.5.5 0 0 0 .5-.5V5a.5.5 0 0 0-.5-.5z" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v11.5M8 11.5l4 4 4-4" />
      <path d="M4.5 16v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V16" />
    </svg>
  );
}

export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5h12a.5.5 0 0 1 .5.5v17l-6.5-4.6L5.5 21V4a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

/** One entry in the action bar. Pulled out because the three of them
 * differ only in icon, label and active colour, and three near-identical
 * button bodies is how they drift apart. */
export function ActionButton({
  active,
  activeColor,
  label,
  count,
  onClick,
  children,
}: {
  active: boolean;
  activeColor: string;
  label: string;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[11px] transition-colors hover:bg-white/5"
      style={{ color: active ? activeColor : "var(--text-secondary)" }}
    >
      {children}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

/** The circle of initials standing in for an avatar. */
export function Avatar({ name, className = "h-9 w-9 text-[11px]" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--bg-elevated)] font-mono font-semibold text-[var(--text-secondary)] ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/** Who wrote it and when. */
export function PostByline({ post }: { post: Post }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Avatar name={post.author} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">
            {post.author}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">{post.handle}</span>
        </div>
        <span className="font-mono text-[11px] text-[var(--text-secondary)]">
          {post.publishedAt} &middot; {post.readTime}
        </span>
      </div>
    </div>
  );
}

/* How large a post's canvas may get, in px.
 *
 * The frame takes the diagram's own aspect (see `previewFrame`), which
 * left to itself would make the trie 958px tall and the four-node list
 * 115px. The floor stops a flat list from becoming a letterbox slit; the
 * ceiling stops a tall tree from making a card you cannot see past. */
const MIN_FIGURE_HEIGHT = 120;
const MAX_FIGURE_HEIGHT = 400;

/** ...and how narrow the figure may get once the ceiling has cut its
 * width down. Below roughly this, the caption's four items — canvas name,
 * language, step, `.lattice` — stop fitting on one line. */
const MIN_FIGURE_WIDTH = 380;

/**
 * The attached canvas, as the post's image.
 *
 * The frame is cut to the diagram rather than the diagram fitted into the
 * frame. It used to be a fixed 16:9 with the drawing letterboxed inside,
 * which meant a tall trie and a flat list were shown in the same box and
 * neither filled it — four of the six seed posts covered half their frame
 * or less. Sizing the box from `previewFrame` costs the feed its perfectly
 * even scroll rhythm and buys back the space the drawings were floating in.
 *
 * A tall diagram hits `MAX_FIGURE_HEIGHT` before it runs out of width, so
 * its figure ends up narrower than the card and is centred there. That is
 * deliberate: leftover space *outside* a bordered frame reads as a margin,
 * where the same space inside one reads as a hole.
 */
export function PostCanvasFigure({ post, className = "" }: { post: Post; className?: string }) {
  const { aspect } = useMemo(() => previewFrame(post.canvas.diagram), [post.canvas.diagram]);

  return (
    // The wrapper carries the caller's insets and does the centring; the
    // figure itself cannot do both, since `mx-auto` and a fixed side inset
    // are the same property.
    <div className={`flex justify-center ${className}`}>
    <figure
      className="w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--bg-elevated)]"
      style={{ maxWidth: `max(${MIN_FIGURE_WIDTH}px, ${aspect * MAX_FIGURE_HEIGHT}px)` }}
    >
      <div
        className="relative w-full"
        // A wash of the post's accent behind the diagram, so the image
        // area reads as a canvas rather than as a hole in the card.
        style={{
          aspectRatio: aspect,
          minHeight: MIN_FIGURE_HEIGHT,
          maxHeight: MAX_FIGURE_HEIGHT,
          background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${post.accent} 12%, transparent), transparent 70%)`,
        }}
      >
        <CanvasPreview diagram={post.canvas.diagram} className="h-full w-full" />
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--hairline)] px-3.5 py-2.5">
        <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">
          {post.canvas.name}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          {LANGUAGE_LABEL[post.canvas.language]}
        </span>
        {/* Not a link to /dashboard/visualizer/<id> yet, deliberately:
          * these canvas ids are seed data with no canvas behind them, and
          * a control that always 404s is worse than no control. It
          * becomes a link the moment posts come from the server. */}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          {post.canvas.stepLabel}
        </span>
        <LatticeAttachment post={post} />
      </figcaption>
    </figure>
    </div>
  );
}

/** How long the control admits to having done something, in ms. */
const SAVED_FEEDBACK_MS = 2000;

/**
 * The post's `.lattice` file, as something a reader can take away.
 *
 * A download is one of the few actions on this page with no visible result
 * — the file lands somewhere the browser chose and the page does not move —
 * so the control says the filename back for a couple of seconds afterwards.
 * Without it the only feedback is the browser's own download shelf, which
 * several of them no longer show.
 *
 * `relative z-10` because a feed card stretches its title link across the
 * whole card (see PostCard); anything clickable inside one has to be lifted
 * over that sheet or the click opens the post instead.
 */
function LatticeAttachment({ post }: { post: Post }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const name = latticeFileName(post);

  // Clearing on unmount rather than only on the next click: navigating from
  // the feed to the post while the label is still up would otherwise set
  // state on a component that has gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onClick={() => {
        downloadLatticeFile(post);
        setSaved(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
      }}
      title={`Download ${name} — the canvas as a file you can open in Code-Canvas`}
      aria-label={`Download "${post.canvas.name}" as a .lattice file`}
      className="relative z-10 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)]"
      style={saved ? { borderColor: "var(--accent-secondary)", color: "var(--accent-secondary)" } : undefined}
    >
      <DownloadIcon />
      {saved ? "Saved" : ".lattice"}
    </button>
  );
}

const TAG_CLASS = "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider";

/**
 * A post's tags.
 *
 * Labels by default and controls when the page around them has a feed to
 * narrow — the same tag should not look clickable on a post's own page,
 * where there is nothing for it to filter. That is why `onToggle` is what
 * decides: the affordance follows the capability rather than a flag
 * somebody has to remember to set correctly in two places.
 */
export function PostTags({
  post,
  className = "",
  active,
  onToggle,
}: {
  post: Post;
  className?: string;
  /** Tags the feed is currently narrowed to, so one that is already doing
   * something says so rather than looking like a fresh choice. */
  active?: ReadonlySet<string>;
  /** Given, every tag becomes a filter control. */
  onToggle?: (tag: string) => void;
}) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {post.tags.map((tag) => {
        const on = active?.has(tag) ?? false;
        const style = {
          borderColor: `color-mix(in srgb, ${post.accent} ${on ? 100 : 40}%, transparent)`,
          background: on ? `color-mix(in srgb, ${post.accent} 20%, transparent)` : undefined,
          color: post.accent,
        };

        return (
          <li key={tag}>
            {onToggle ? (
              // `relative z-10`, because a feed card stretches its title
              // link across the whole card; without it this click opens
              // the post instead of filtering by the tag.
              <button
                type="button"
                onClick={() => onToggle(tag)}
                aria-pressed={on}
                aria-label={on ? `Stop filtering by ${tag}` : `Show only posts tagged ${tag}`}
                className={`${TAG_CLASS} relative z-10 transition-colors hover:brightness-125`}
                style={style}
              >
                {tag}
              </button>
            ) : (
              <span className={`${TAG_CLASS} inline-block`} style={style}>
                {tag}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
