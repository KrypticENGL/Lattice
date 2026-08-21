"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getResourceUsage, type ResourceUsage } from "@/lib/resources";

const POLL_INTERVAL_MS = 5000;

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const BAR_HEIGHT = 6;

/**
 * One usage row: the label and its raw figures on top, a proportional bar
 * and the derived percentage underneath.
 *
 * Linear rather than a dial because of the shape of the space and of the
 * data. This panel lives in the dashboard's 320px right-hand column, where
 * three rings sit in a cramped row and each one's caption ("128 MB / 512
 * MB") is wider than the ring it belongs to. Stacked bars run the long way
 * instead, so the captions get room, the three rows share a left edge that
 * makes them scannable against each other, and the bar's length maps to
 * "how full" far more directly than an arc's sweep does.
 */
function UsageBar({ label, value, percent }: { label: string; value: string; percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 90 ? "#ff4d4d" : "var(--accent-secondary)";

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
          {value}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="min-w-0 flex-1 overflow-hidden rounded-full"
          style={{ height: BAR_HEIGHT, background: "var(--hairline)" }}
        >
          {/* Width, not transform: a scaled bar would stretch its own
              rounded end caps into ellipses at low percentages. */}
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${clamped}%`, background: color }}
          />
        </div>
        {/* Fixed width so the three bars end on the same x, rather than
            each one's length depending on how many digits it reads. */}
        <span className="w-9 shrink-0 text-right font-mono text-[11px] font-semibold text-[var(--text-primary)]">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  );
}

export default function ResourceMonitor() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const token = await getToken();
        const result = await getResourceUsage(token);
        if (!cancelled) {
          setUsage(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load resource usage.");
        }
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isSignedIn, getToken]);

  return (
    // Sized by its own content, not stretched to fill the column: three
    // bars need ~150px and the panel has nothing else to show, so letting
    // it claim half the sidebar just pushed everything else off-screen.
    // The neighbouring Notifications list takes the slack instead — it
    // has arbitrarily many rows and can actually use the room.
    <div className="matte flex flex-col rounded-2xl p-4">
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Resource Monitor
        </h2>
        <span className="font-mono text-[13px] uppercase tracking-wider text-[var(--accent-secondary)]">
          Free tier
        </span>
      </div>

      {/* A floor rather than a stretch, so "Checking usage…", an error and
        * the loaded bars all occupy the same box and the sidebar doesn't
        * lurch when the first poll lands. */}
      <div className="mt-3 flex min-h-[9.25rem] items-center justify-center">
        {!isLoaded || (isSignedIn && !usage && !error) ? (
          <p className="font-mono text-[12px] text-[var(--text-secondary)]">Checking usage…</p>
        ) : !isSignedIn ? (
          <p className="font-mono text-[12px] text-[var(--text-secondary)]">
            Sign in to see your sandbox usage.
          </p>
        ) : error ? (
          <p className="font-mono text-[12px] text-[var(--text-secondary)]">{error}</p>
        ) : (
          usage && (
            <div className="flex w-full flex-col gap-3.5">
              <UsageBar
                label="Containers"
                value={`${usage.containers.used} / ${usage.containers.limit}`}
                percent={(usage.containers.used / usage.containers.limit) * 100}
              />
              {/* Shown as used-of-limit like the other two rows, rather
                * than the bare `used_percent` it used to be. The bar's own
                * readout is already a percentage — of the *limit* — so a
                * lone "68%" beside it looked like the same number printed
                * twice whenever the cap happened to be 100%. */}
              <UsageBar
                label="Max CPU"
                value={`${usage.cpu.used_percent.toFixed(0)}% / ${usage.cpu.limit_percent.toFixed(0)}%`}
                percent={(usage.cpu.used_percent / usage.cpu.limit_percent) * 100}
              />
              <UsageBar
                label="Max Memory"
                value={`${formatMb(usage.memory.used_bytes)} / ${formatMb(usage.memory.limit_bytes)}`}
                percent={(usage.memory.used_bytes / usage.memory.limit_bytes) * 100}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
