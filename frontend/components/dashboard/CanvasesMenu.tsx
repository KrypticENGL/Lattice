"use client";

import { useState } from "react";
import { CANVASES } from "@/lib/dashboard-data";

export default function CanvasesMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = CANVASES.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="matte flex items-center gap-2 rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="6" cy="7" r="2.1" />
          <circle cx="18" cy="7" r="2.1" />
          <circle cx="12" cy="18" r="2.1" />
          <path d="M7.7 8.6L10.5 16M16.3 8.6L13.5 16M8.1 7h7.8" />
        </svg>
        Canvases
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="matte absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-2xl p-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search canvases..."
              autoFocus
              className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg-base)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-secondary)] focus:outline-none"
            />

            <ul className="scrollbar-thin mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <li className="px-2 py-6 text-center font-mono text-[12px] text-[var(--text-secondary)]">
                  No canvases found.
                </li>
              )}
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                        {c.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
                        {c.language} · {c.nodes} nodes
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-[var(--text-secondary)]">
                      {c.editedAt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
