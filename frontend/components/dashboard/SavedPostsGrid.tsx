"use client";

import { useState } from "react";
import { SAVED_POSTS, type SavedPost } from "@/lib/dashboard-data";

export default function SavedPostsGrid() {
  const [saved, setSaved] = useState<SavedPost[]>(SAVED_POSTS);

  function unsave(id: string) {
    setSaved((prev) => prev.filter((p) => p.id !== id));
  }

  if (saved.length === 0) {
    return (
      <div className="matte flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl p-10 text-center">
        <p className="font-serif text-[15px] text-[var(--text-secondary)]">
          Nothing saved yet &mdash; bookmark a post to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <span className="shrink-0 font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)]">
        {saved.length} saved
      </span>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((p) => (
            <div key={p.id} className="matte flex flex-col rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: p.accent }}
                />
                <button
                  type="button"
                  onClick={() => unsave(p.id)}
                  aria-label={`Remove "${p.title}" from saved posts`}
                  className="-mt-1 -mr-1 shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/5"
                  style={{ color: "var(--accent-secondary)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 3.5A1.5 1.5 0 0 1 7.5 2h9A1.5 1.5 0 0 1 18 3.5V21l-6-4.2L6 21V3.5z" />
                  </svg>
                </button>
              </div>

              <h3 className="mt-2 font-serif text-[16px] font-bold leading-snug text-[var(--text-primary)]">
                {p.title}
              </h3>

              <p className="mt-2 flex-1 font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
                &ldquo;{p.excerpt}&rdquo;
              </p>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                  {p.author} &middot; {p.readTime}
                </span>
                <span className="font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {p.savedAt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
