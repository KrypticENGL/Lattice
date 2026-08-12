"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getResourceUsage, type ResourceUsage } from "@/lib/resources";

const POLL_INTERVAL_MS = 5000;

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const GAUGE_SIZE = 76;
const GAUGE_STROKE = 6;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function CircularGauge({ label, value, percent }: { label: string; value: string; percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 90 ? "#ff4d4d" : "var(--accent-secondary)";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
        <svg
          width={GAUGE_SIZE}
          height={GAUGE_SIZE}
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth={GAUGE_STROKE}
          />
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - clamped / 100)}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold text-[var(--text-primary)]">
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="font-mono text-[11px] text-[var(--text-secondary)]">{value}</span>
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
    <div className="matte flex h-full min-h-0 flex-col rounded-2xl p-5">
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Resource Monitor
        </h2>
        <span className="font-mono text-[13px] uppercase tracking-wider text-[var(--accent-secondary)]">
          Free tier
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
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
            <div className="flex w-full items-start justify-around">
              <CircularGauge
                label="Containers"
                value={`${usage.containers.used} / ${usage.containers.limit}`}
                percent={(usage.containers.used / usage.containers.limit) * 100}
              />
              <CircularGauge
                label="Max CPU"
                value={`${usage.cpu.used_percent.toFixed(0)}%`}
                percent={(usage.cpu.used_percent / usage.cpu.limit_percent) * 100}
              />
              <CircularGauge
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
