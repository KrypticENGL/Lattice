"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { deleteCanvas, listCanvases, type CanvasSummary } from "@/lib/canvases";

function relativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CanvasesMenu() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const rows = await listCanvases(token);
        if (!cancelled) setCanvases(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load canvases.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  const filtered = canvases.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  function openCanvas(id: string) {
    setOpen(false);
    router.push(`/dashboard/visualizer/${id}`);
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      const token = await getToken();
      await deleteCanvas(id, token);
      setCanvases((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that canvas.");
    } finally {
      setDeletingId(null);
    }
  }

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
              {loading ? (
                <li className="px-2 py-6 text-center font-mono text-[12px] text-[var(--text-secondary)]">
                  Loading…
                </li>
              ) : error ? (
                <li className="px-2 py-6 text-center font-mono text-[12px] text-[var(--text-secondary)]">
                  {error}
                </li>
              ) : filtered.length === 0 ? (
                <li className="px-2 py-6 text-center font-mono text-[12px] text-[var(--text-secondary)]">
                  No canvases found.
                </li>
              ) : (
                filtered.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1 rounded-xl transition-colors hover:bg-white/5">
                    <button
                      type="button"
                      onClick={() => openCanvas(c.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                            {c.name}
                          </span>
                          {/* Its code is generated from a graph, so it
                              reads and runs here but isn't editable —
                              worth saying before the user opens it. */}
                          {c.origin === "code_canvas" && (
                            <span
                              title="Generated from a Code-Canvas graph"
                              className="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                              style={{
                                borderColor: "color-mix(in srgb, var(--accent-secondary) 45%, transparent)",
                                color: "var(--accent-secondary)",
                              }}
                            >
                              Graph
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
                          {c.language} · {c.step_count} steps
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-[var(--text-secondary)]">
                        {relativeTime(c.updated_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={deletingId === c.id}
                      title="Delete canvas"
                      aria-label={`Delete ${c.name}`}
                      className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 transition-colors hover:bg-white/10 hover:text-[#ff4d4d] focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7m-8 0v13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5V7" />
                      </svg>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
