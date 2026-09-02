"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CanvasPreview from "./CanvasPreview";
import {
  archiveFileName,
  downloadAllAttachments,
  downloadAttachment,
  latticeFileName,
} from "@/lib/posts/lattice";
import { previewFrame } from "@/lib/posts/preview-frame";
import { initials } from "@/lib/posts/use-posts";
import { relativeTime } from "@/lib/relative-time";
import type { CanvasAttachment, Post } from "@/lib/posts/types";

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

export const LANGUAGE_LABEL: Record<CanvasAttachment["language"], string> = {
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
          {/* `publishedAt` is an instant now, not the pre-rendered label
            * it used to be when posts were seed data — so it is formatted
            * here rather than rendered raw, which put an ISO timestamp in
            * the byline. */}
          {relativeTime(post.publishedAt)} &middot; {post.readTime}
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
/** A floor for the figure's width, so a very wide-and-short diagram still
 * gets a frame with some presence rather than a letterbox slot. */
const MIN_FIGURE_WIDTH = 380;

/**
 * A post's canvases, as a carousel.
 *
 * The frame is cut to the diagram rather than the diagram fitted into the
 * frame: a tall trie and a flat list shown in one fixed 16:9 box would
 * each float in most of it. Sizing from `previewFrame` costs the feed its
 * perfectly even scroll rhythm and buys back the space the drawings were
 * floating in.
 *
 * The frame is sized from *every* attachment, not just the visible one —
 * the widest aspect and the tallest of them win. A box that resized as the
 * reader stepped through would shift everything below it on the page on
 * each press, which in a feed means the next post jumping.
 *
 * A single-canvas post renders exactly as it always did: no arrows, no
 * dots, no counter. The carousel appears only when there is something to
 * step through.
 */
export function PostCanvasFigure({ post, className = "" }: { post: Post; className?: string }) {
  const [index, setIndex] = useState(0);
  const canvases = post.canvases;
  const many = canvases.length > 1;
  // A post whose attachments changed under a mounted card (an edit, a
  // refetch) must not be left pointing past the end of the new list.
  const current = canvases[Math.min(index, canvases.length - 1)];

  const { aspect } = useMemo(() => {
    const frames = canvases.map((canvas) => previewFrame(canvas.diagram));
    return { aspect: Math.max(...frames.map((frame) => frame.aspect)) };
  }, [canvases]);

  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + canvases.length) % canvases.length),
    [canvases.length],
  );

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
          <CanvasPreview diagram={current.diagram} className="h-full w-full" />

          {many && (
            <>
              <CarouselArrow direction="prev" onClick={() => step(-1)} name={current.name} />
              <CarouselArrow direction="next" onClick={() => step(1)} name={current.name} />
            </>
          )}
        </div>

        {many && (
          // Under the drawing rather than over it: dots on top of a diagram
          // sit on whatever the drawing happens to have there, and half of
          // these are line art on a dark wash.
          <div className="relative z-10 flex items-center justify-center gap-1.5 border-t border-[var(--hairline)] py-2">
            {canvases.map((canvas, i) => (
              <button
                key={`${canvas.canvasId}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show "${canvas.name}" (${i + 1} of ${canvases.length})`}
                aria-current={i === index}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === index ? 16 : 6,
                  background: i === index ? "var(--accent-secondary)" : "var(--hairline)",
                }}
              />
            ))}
          </div>
        )}

        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--hairline)] px-3.5 py-2.5">
          <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">
            {current.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {LANGUAGE_LABEL[current.language]}
          </span>
          {many && (
            <span className="font-mono text-[10px] tabular-nums uppercase tracking-wider text-[var(--text-secondary)]">
              {index + 1}/{canvases.length}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {current.stepLabel}
          </span>
          <LatticeAttachment post={post} canvas={current} />
        </figcaption>
      </figure>
    </div>
  );
}

/** One edge of the carousel. Sized for a thumb and pinned to the frame's
 * side, so stepping through never requires aiming at a dot. */
function CarouselArrow({
  direction,
  onClick,
  name,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  name: string;
}) {
  const prev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={prev ? `Previous canvas (showing "${name}")` : `Next canvas (showing "${name}")`}
      // `z-10` for the same reason the download button has it: a feed card
      // stretches its title link across the whole card, and anything
      // clickable inside has to sit over that sheet.
      className={`absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--bg-surface)]/80 text-[var(--text-secondary)] backdrop-blur transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)] ${
        prev ? "left-2" : "right-2"
      }`}
    >
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: prev ? "rotate(90deg)" : "rotate(-90deg)" }}
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  );
}

const SAVED_FEEDBACK_MS = 2000;

/**
 * The post's attachments, as something a reader can take away — this one,
 * or all of them.
 *
 * Two controls because they answer two different questions, and a single
 * one would have to guess which was meant. "This" is what a reader who
 * stepped to a particular canvas wants; "All" is what someone who wants
 * the whole post wants, and it arrives as a zip because a browser drops
 * every download after the first one or two from a single gesture. The
 * second control is absent on a single-canvas post, where the two would do
 * exactly the same thing.
 *
 * A download is one of the few actions on this page with no visible result
 * — the file lands somewhere the browser chose and the page does not move —
 * so a control says its filename back for a couple of seconds afterwards.
 * Without it the only feedback is the browser's own download shelf, which
 * several of them no longer show.
 *
 * `relative z-10` because a feed card stretches its title link across the
 * whole card (see PostCard); anything clickable inside one has to be lifted
 * over that sheet or the click opens the post instead.
 */
function LatticeAttachment({ post, canvas }: { post: Post; canvas: CanvasAttachment }) {
  const [saved, setSaved] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const many = post.canvases.length > 1;

  // Clearing on unmount rather than only on the next click: navigating from
  // the feed to the post while the label is still up would otherwise set
  // state on a component that has gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((label: string) => {
    setSaved(label);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(null), SAVED_FEEDBACK_MS);
  }, []);

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <AttachmentButton
        onClick={() => {
          downloadAttachment(canvas);
          flash("this");
        }}
        title={`Download ${latticeFileName(canvas)} — this canvas as a file you can open in Code-Canvas`}
        ariaLabel={`Download "${canvas.name}" as a .lattice file`}
        saved={saved === "this"}
      >
        {many ? "This" : ".lattice"}
      </AttachmentButton>

      {many && (
        <AttachmentButton
          onClick={() => {
            downloadAllAttachments(post);
            flash("all");
          }}
          title={`Download ${archiveFileName(post)} — all ${post.canvases.length} canvases as one archive`}
          ariaLabel={`Download all ${post.canvases.length} canvases as a zip archive`}
          saved={saved === "all"}
        >
          All {post.canvases.length}
        </AttachmentButton>
      )}
    </span>
  );
}

function AttachmentButton({
  onClick,
  title,
  ariaLabel,
  saved,
  children,
}: {
  onClick: () => void;
  title: string;
  ariaLabel: string;
  saved: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="relative z-10 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)]"
      style={saved ? { borderColor: "var(--accent-secondary)", color: "var(--accent-secondary)" } : undefined}
    >
      <DownloadIcon />
      {saved ? "Saved" : children}
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
