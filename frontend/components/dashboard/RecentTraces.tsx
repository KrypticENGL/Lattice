import { RECENT_TRACES } from "@/lib/dashboard-data";

export default function RecentTraces() {
  return (
    <div className="matte rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Recent traces
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          {RECENT_TRACES.length} runs
        </span>
      </div>

      <ul className="mt-2 flex flex-col">
        {RECENT_TRACES.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] py-2.5 first:border-t-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: t.accent }}
              />
              <div className="min-w-0">
                <p className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                  {t.structure}
                </p>
                <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.snippet}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                {t.steps} steps
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                {t.ranAt}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
