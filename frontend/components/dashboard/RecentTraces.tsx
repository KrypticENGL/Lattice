"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getTraces, type TraceRun } from "@/lib/dashboard-data";
import { relativeTime } from "@/lib/relative-time";

// Cycles through the same palette the mock data used to hand-assign, keyed
// off the run's id so a given trace keeps its color across a re-render
// without the backend having to carry a display color as data.
const ACCENTS = ["var(--accent-secondary)", "var(--accent-primary)", "#c2703d", "#b5651d", "#e8993d"];

function accentFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export default function RecentTraces() {
  const { getToken, isSignedIn } = useAuth();
  const [traces, setTraces] = useState<TraceRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        const { recent } = await getTraces(token);
        if (!cancelled) setTraces(recent);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load recent traces.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  return (
    <div className="matte flex h-full min-h-0 flex-col rounded-2xl p-3.5">
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className="font-serif text-[15px] font-bold text-[var(--text-primary)]">
          Recent traces
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          {traces ? `${traces.length} runs` : ""}
        </span>
      </div>

      <ul className="scrollbar-thin mt-2 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1">
        {!traces && !error && (
          <li className="flex flex-1 items-center justify-center font-mono text-[12px] text-[var(--text-secondary)]">
            Loading…
          </li>
        )}
        {error && (
          <li className="flex flex-1 items-center justify-center font-mono text-[12px] text-[var(--text-secondary)]">
            {error}
          </li>
        )}
        {traces && traces.length === 0 && (
          <li className="flex flex-1 items-center justify-center text-center font-serif text-[12.5px] text-[var(--text-secondary)]">
            No traces yet — run something in the Visualizer.
          </li>
        )}
        {traces?.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] py-2 first:border-t-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: accentFor(t.id) }}
              />
              <div className="min-w-0">
                <p className="truncate font-serif text-[12.5px] font-semibold text-[var(--text-primary)]">
                  {t.structure}
                </p>
                <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.snippet}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--text-secondary)]">
                {t.steps} steps
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[10.5px] uppercase tracking-wider text-[var(--text-secondary)]">
                {relativeTime(t.ranAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
