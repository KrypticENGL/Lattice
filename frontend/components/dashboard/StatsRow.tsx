"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getStats, type Stats } from "@/lib/dashboard-data";
import StatCard from "@/components/dashboard/StatCard";

export default function StatsRow() {
  const { getToken, isSignedIn } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        const result = await getStats(token);
        if (!cancelled) setStats(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load stats.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const cards = stats
    ? [
        {
          label: "Canvases created",
          value: String(stats.canvasesCreated),
          delta: `+${stats.canvasesCreatedThisWeek} this week`,
        },
        {
          label: "Traces run",
          value: String(stats.tracesRun),
          delta: `+${stats.tracesRunThisWeek} this week`,
        },
        {
          label: "Day streak",
          value: String(stats.currentStreak),
          delta: `Personal best: ${stats.longestStreak}`,
        },
      ]
    : [
        { label: "Canvases created", value: "—", delta: error ?? "Loading…" },
        { label: "Traces run", value: "—", delta: error ?? "Loading…" },
        { label: "Day streak", value: "—", delta: error ?? "Loading…" },
      ];

  return (
    <div className="grid shrink-0 gap-3 sm:grid-cols-3">
      {cards.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
