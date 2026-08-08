import { getActivityWeeks } from "@/lib/dashboard-data";

const LEVEL_STYLE: Record<number, string> = {
  0: "color-mix(in srgb, var(--bg-elevated) 100%, transparent)",
  1: "color-mix(in srgb, var(--accent-primary) 22%, var(--bg-elevated))",
  2: "color-mix(in srgb, var(--accent-primary) 45%, var(--bg-elevated))",
  3: "color-mix(in srgb, var(--accent-primary) 70%, var(--bg-elevated))",
  4: "var(--accent-primary)",
};

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export default function ActivityHeatmap() {
  const weeks = getActivityWeeks();
  const totalTraces = weeks.flat().reduce((sum, d) => sum + d.count, 0);
  const activeDays = weeks.flat().filter((d) => d.count > 0).length;

  return (
    <div className="matte rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[19px] font-bold text-[var(--text-primary)]">
          Activity
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          {totalTraces} traces · {activeDays} active days
        </p>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col justify-between py-[3px] font-mono text-[10px] text-[var(--text-secondary)]">
          {DAY_LABELS.map((label, i) => (
            <span key={i} className="h-[13px] leading-[13px]">
              {label}
            </span>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <span
                  key={day.date}
                  title={`${day.date} — ${day.count} trace${day.count === 1 ? "" : "s"}`}
                  className="block h-[13px] w-[13px] rounded-[3px]"
                  style={{ background: LEVEL_STYLE[day.level] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="block h-[11px] w-[11px] rounded-[3px]"
            style={{ background: LEVEL_STYLE[level] }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
