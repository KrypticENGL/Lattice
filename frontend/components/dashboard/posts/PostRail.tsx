"use client";

import Link from "next/link";
import { Avatar } from "./PostChrome";
import { getAuthorProfile } from "@/lib/posts/authors";
import { POSTS } from "@/lib/posts/data";
import { tagCounts } from "@/lib/posts/search";
import { useSavedPosts } from "@/lib/posts/use-posts";
import type { Post } from "@/lib/posts/types";

/**
 * The column beside the feed.
 *
 * The feed is one narrow column because prose has a measure, which on a
 * wide screen left 432px of nothing down each side. This is what goes in
 * one of them — and it is deliberately made of things the app already
 * knew and had nowhere to say: the tags every card carries and nothing
 * could be done with, the author records in `authors.ts` that only ever
 * appeared on a post's own page, and the bookmarks that lived on a route
 * of their own.
 *
 * Everything here is navigation, not filler. A rail that existed to fill
 * space would be worse than the space.
 *
 * Hidden below `xl` rather than stacked under the feed, unlike the author
 * card on a post's page. That card is about the piece you have just read,
 * so it follows it; a set of controls for narrowing a list is no use
 * underneath six screens of the list it narrows. The cards' own tags stay
 * clickable at every width, so nothing here is the only way to reach it.
 */

function RailSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="matte rounded-2xl p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        {title}
        {count !== undefined && (
          <span className="ml-1.5 tabular-nums text-[var(--text-primary)]">{count}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** The reader's bookmarks, as a way back rather than as a second feed —
 * `/dashboard/saved` already renders them full size, and repeating that
 * here would be the same page twice on one screen. */
function SavedSection({ saved }: { saved: Post[] }) {
  return (
    <RailSection title="Saved" count={saved.length}>
      <ul className="mt-2.5 flex flex-col">
        {saved.slice(0, 4).map((post) => (
          <li key={post.id}>
            <Link
              href={`/dashboard/posts/${post.id}`}
              className="block rounded-lg px-2 py-1.5 font-serif text-[13px] leading-snug text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>

      {saved.length > 4 && (
        <Link
          href="/dashboard/saved"
          className="mt-1 inline-block px-2 font-mono text-[10px] uppercase tracking-wider text-[var(--accent-secondary)] transition-colors hover:brightness-125"
        >
          All {saved.length} saved &rarr;
        </Link>
      )}
    </RailSection>
  );
}

/**
 * Every tag in the feed, with how many posts carry it.
 *
 * The counts are over the whole feed rather than over what is currently
 * on screen, on purpose: a tag reading "3" and then showing you three
 * posts is the point of the number, and one that counted only the
 * already-filtered set would tick down to 1 next to every tag the moment
 * you picked anything.
 */
function TagSection({
  active,
  onToggle,
  onClear,
}: {
  active: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  const tags = tagCounts(POSTS);

  return (
    <RailSection title="Browse by tag">
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {tags.map(({ tag, count }) => {
          const on = active.has(tag);
          return (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onToggle(tag)}
                aria-pressed={on}
                aria-label={on ? `Stop filtering by ${tag}` : `Show only posts tagged ${tag}`}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
                style={{
                  borderColor: on
                    ? "var(--accent-secondary)"
                    : "var(--hairline)",
                  background: on
                    ? "color-mix(in srgb, var(--accent-secondary) 18%, transparent)"
                    : undefined,
                  color: on ? "var(--accent-secondary)" : "var(--text-secondary)",
                }}
              >
                {tag}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {active.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Clear {active.size} tag{active.size === 1 ? "" : "s"}
        </button>
      )}
    </RailSection>
  );
}

/**
 * Who is writing here.
 *
 * Built from the posts rather than from `authors.ts` directly, so the
 * list is people with something in the feed and not a roster — and an
 * author whose profile is missing still shows their post count instead
 * of vanishing, the same bargain `AuthorProfileCard` makes.
 *
 * A row sets the search box to the author's handle rather than opening a
 * profile page, because there is no profile route to open. The handle is
 * already part of what `searchPosts` matches on, so this is the existing
 * feature pointed at from somewhere useful rather than a new one.
 */
function AuthorSection({ onPick }: { onPick: (handle: string) => void }) {
  const byHandle = new Map<string, { post: Post; posts: number }>();
  for (const post of POSTS) {
    const seen = byHandle.get(post.handle);
    if (seen) seen.posts += 1;
    else byHandle.set(post.handle, { post, posts: 1 });
  }

  const authors = [...byHandle.values()]
    .map(({ post, posts }) => ({ post, posts, profile: getAuthorProfile(post.handle) }))
    .sort((a, b) => (b.profile?.traceRuns ?? 0) - (a.profile?.traceRuns ?? 0));

  return (
    <RailSection title="Who's posting">
      <ul className="mt-2.5 flex flex-col gap-0.5">
        {authors.map(({ post, posts, profile }) => (
          <li key={post.handle}>
            <button
              type="button"
              onClick={() => onPick(post.handle)}
              aria-label={`Search the feed for ${post.handle}`}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
            >
              <Avatar name={post.author} className="h-7 w-7 text-[9px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                  {post.handle}
                </span>
                <span className="block font-mono text-[10px] text-[var(--text-secondary)]">
                  {posts} post{posts === 1 ? "" : "s"}
                  {profile && ` · ${profile.traceRuns.toLocaleString("en-US")} traces`}
                </span>
              </span>
              {/* The streak is the one number here that is about keeping
                * at it rather than about volume, so it gets the accent. */}
              {profile && (
                <span
                  className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--accent-primary)]"
                  title={`Longest streak: ${profile.longestStreak} days`}
                >
                  {profile.longestStreak}d
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </RailSection>
  );
}

export default function PostRail({
  activeTags,
  onToggleTag,
  onClearTags,
  onPickAuthor,
  className = "",
}: {
  activeTags: ReadonlySet<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onPickAuthor: (handle: string) => void;
  className?: string;
}) {
  const saved = useSavedPosts();

  return (
    // Sticky against `main`, which is what actually scrolls in the
    // dashboard shell — the document does not. Capped and scrollable in
    // its own right so a short window cannot put the bottom panel
    // somewhere the reader can never reach.
    <aside
      className={`scrollbar-hide sticky top-0 flex max-h-[calc(100dvh-3rem)] flex-col gap-4 overflow-y-auto ${className}`}
    >
      {saved.length > 0 && <SavedSection saved={saved} />}
      <TagSection active={activeTags} onToggle={onToggleTag} onClear={onClearTags} />
      <AuthorSection onPick={onPickAuthor} />
    </aside>
  );
}
