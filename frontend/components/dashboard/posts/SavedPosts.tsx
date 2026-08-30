"use client";

import Link from "next/link";
import PostCard from "./PostCard";
import { useSavedPosts } from "@/lib/posts/use-posts";

/**
 * The saved feed.
 *
 * Deliberately the same `PostCard` the main feed uses rather than a
 * compact variant. A bookmark is somewhere you come back to read, so the
 * post needs to be readable here — and sharing the card means liking,
 * commenting and un-saving all behave identically in both places instead
 * of being reimplemented once per page and drifting.
 *
 * Un-saving removes the card from under the reader immediately, which is
 * the right behaviour on this page and would be wrong on the feed: here
 * the list *is* the set of saved posts, so a card that stayed would be
 * claiming something untrue.
 */
export default function SavedPosts() {
  const saved = useSavedPosts();

  if (saved.length === 0) {
    return (
      // Same measure as the feed and the page heading. Left to fill the
      // outer container it sat a good 400px wider than everything else on
      // the page and started 200px further left, which reads as a
      // different page rather than as the same one with nothing in it.
      <div className="matte mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center">
        <p className="font-serif text-[15px] text-[var(--text-secondary)]">
          Nothing saved yet &mdash; bookmark a post to see it here.
        </p>
        <Link
          href="/dashboard/posts"
          className="rail-pill glass-flat inline-flex rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
        >
          Browse posts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <span className="font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
        {saved.length} saved
      </span>

      {saved.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
