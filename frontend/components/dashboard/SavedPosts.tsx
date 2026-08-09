"use client";

import { useState } from "react";
import { SAVED_POSTS, type SavedPost } from "@/lib/dashboard-data";

export default function SavedPosts() {
  const [saved, setSaved] = useState<SavedPost[]>(SAVED_POSTS);

  function unsave(id: string) {
    setSaved((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="matte flex flex-col rounded-2xl p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Saved posts
        </h2>
        <span className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)]">
          {saved.length} saved
        </span>
      </div>

      {saved.length === 0 ? (
        <p className="mt-4 font-serif text-[13px] text-[var(--text-secondary)]">
          Nothing saved yet — bookmark a post to see it here.
        </p>
      ) : (
        <ul className="scrollbar-thin mt-4 flex max-h-[280px] flex-col overflow-y-auto pr-1">
          {saved.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                  {p.title}
                </p>
                <p className="mt-1 font-mono text-[12px] text-[var(--text-secondary)]">
                  {p.author} &middot; {p.readTime}
                </p>
                <p className="mt-0.5 font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Saved {p.savedAt}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unsave(p.id)}
                aria-label={`Remove "${p.title}" from saved posts`}
                className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/5"
                style={{ color: "var(--accent-secondary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3.5A1.5 1.5 0 0 1 7.5 2h9A1.5 1.5 0 0 1 18 3.5V21l-6-4.2L6 21V3.5z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
