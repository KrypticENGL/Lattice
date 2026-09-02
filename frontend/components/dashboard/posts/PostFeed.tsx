"use client";

import { useCallback, useMemo, useState } from "react";
import PostCard from "./PostCard";
import PostRail from "./PostRail";
import { POSTS } from "@/lib/posts/data";
import { filterByTags, searchPosts, sortPosts, type SortOrder } from "@/lib/posts/search";
import { usePostState } from "@/lib/posts/use-posts";

/**
 * The community feed.
 *
 * The posts themselves stay in one column, and a narrow one. These are
 * posts with a diagram and three paragraphs of prose, so the constraint
 * that matters is line length, not how much of the screen gets filled —
 * a two-up grid of these would give every card a 30-word measure and
 * halve the size of the drawing that is the reason the post exists.
 *
 * What the column does not need, the rail beside it takes: tags, authors
 * and bookmarks, at `xl` and up, on the same terms the post page gives
 * its author card (`xl:sticky`, `w-72`). The reading column comes out
 * *narrower* than the full-width version it replaces, which is the right
 * direction — 672px of 14px serif is around ninety characters a line,
 * well past where prose stops being comfortable.
 *
 * Filter state lives here rather than in the rail because both halves
 * read it: the rail offers the tags, the cards show which are on, and
 * the count pill has to agree with both.
 *
 * The row above the cards is built as a rail of pills, the same material
 * and type scale as Code-Canvas's header controls: one dashboard, one set
 * of chrome, whichever workspace you are standing in.
 */

function SearchIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

const ORDERS: { value: SortOrder; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "top", label: "Top" },
];

export default function PostFeed() {
  const { saved } = usePostState();
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<ReadonlySet<string>>(() => new Set());
  const [order, setOrder] = useState<SortOrder>("latest");

  const visible = useMemo(
    () => sortPosts(filterByTags(searchPosts(POSTS, query), tags), order),
    [query, tags, order],
  );

  const filtering = query.trim().length > 0 || tags.size > 0;

  const toggleTag = useCallback((tag: string) => {
    setTags((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setQuery("");
    setTags(new Set());
  }, []);

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rail-pill glass-flat flex gap-2 rounded-full px-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {/* While filtering this counts what is on screen, not what
              * exists — the number has to agree with the list under it, or
              * it reads as posts the filter has hidden from you. */}
            <span className="text-[var(--text-primary)]">{visible.length}</span>
            {filtering ? `of ${POSTS.length} posts` : "posts"}
            {/* Only once there is something to point at. A permanent
              * "0 saved" is a label for a feature the reader has not used
              * rather than a way back to anything. */}
            {saved.length > 0 && (
              <>
                <span className="h-3 w-px bg-[var(--hairline)]" />
                <span className="text-[var(--accent-secondary)]">{saved.length} saved</span>
              </>
            )}
          </span>

          {/* Two pills in one shell rather than two separate controls: the
            * order is one choice with two answers, and a pair of pills
            * that happen to be adjacent does not say that. */}
          <div
            className="rail-pill glass-flat flex gap-1 rounded-full p-0.5"
            role="group"
            aria-label="Sort posts"
          >
            {ORDERS.map(({ value, label }) => {
              const on = order === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOrder(value)}
                  aria-pressed={on}
                  className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
                  style={{
                    background: on ? "var(--bg-elevated)" : undefined,
                    color: on ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <label className="rail-pill glass-flat ml-auto flex min-w-0 flex-1 gap-2 rounded-full px-3 text-[var(--text-secondary)] focus-within:border-[var(--accent-secondary)] sm:max-w-[16rem] sm:flex-none">
            <SearchIcon />
            <span className="sr-only">Search posts</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts"
              // Escape empties the field rather than leaving the feed
              // filtered behind a box the reader has already stopped
              // looking at. Safari's own search-field clear is suppressed
              // in globals.css so the pill keeps one clear affordance.
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title="Clear search"
                aria-label="Clear search"
                className="shrink-0 font-mono text-[11px] leading-none text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                &times;
              </button>
            )}
          </label>
        </div>

        {visible.map((post) => (
          <PostCard key={post.id} post={post} activeTags={tags} onToggleTag={toggleTag} />
        ))}

        {/* A panel rather than a line of centred mono in the middle of
          * nothing, and one that carries the way out: the reader who has
          * narrowed this to zero is the one person on the page who
          * definitely wants a control. */}
        {visible.length === 0 && (
          <div className="matte flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
            <p className="font-serif text-[15px] leading-7 text-[var(--text-secondary)]">
              No posts match{" "}
              {query.trim() && <span className="text-[var(--text-primary)]">&ldquo;{query.trim()}&rdquo;</span>}
              {query.trim() && tags.size > 0 && " with "}
              {tags.size > 0 && (
                <span className="text-[var(--text-primary)]">{[...tags].join(" + ")}</span>
              )}
              .
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="rail-pill glass-flat inline-flex rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
            >
              Show everything
            </button>
          </div>
        )}
      </div>

      <PostRail
        activeTags={tags}
        onToggleTag={toggleTag}
        onClearTags={() => setTags(new Set())}
        onPickAuthor={setQuery}
        className="hidden w-72 shrink-0 xl:flex"
      />
    </div>
  );
}
