/**
 * Live data for the You page's widgets — `/api/stats/me`, `/api/traces` and
 * `/api/notifications`. Same shapes and function names the mock arrays used
 * to export, so nothing above this file (StatCard consumers, ActivityHeatmap,
 * RecentTraces, Notifications) had to change its rendering, only where its
 * data comes from.
 */

import { apiRequest } from "@/lib/api";

export type ActivityDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type TraceRun = {
  id: string;
  structure: string;
  snippet: string;
  steps: number;
  ranAt: string;
};

type TraceRunRow = {
  id: string;
  structure: string;
  snippet: string;
  steps: number;
  ran_at: string;
};

type TracesResponse = {
  recent: TraceRunRow[];
  weeks: ActivityDay[][];
};

/** `GET /api/traces` — one round trip backs both the Activity heatmap and
 * Recent Traces, since both read the same run history. */
export async function getTraces(token: string | null) {
  const res = await apiRequest<TracesResponse>("/api/traces", token);
  return {
    weeks: res.weeks,
    recent: res.recent.map((t) => ({
      id: t.id,
      structure: t.structure,
      snippet: t.snippet,
      steps: t.steps,
      ranAt: t.ran_at,
    })) satisfies TraceRun[],
  };
}

export type Stats = {
  canvasesCreated: number;
  canvasesCreatedThisWeek: number;
  tracesRun: number;
  tracesRunThisWeek: number;
  currentStreak: number;
  longestStreak: number;
};

type StatsRow = {
  canvases_created: number;
  canvases_created_this_week: number;
  traces_run: number;
  traces_run_this_week: number;
  current_streak: number;
  longest_streak: number;
};

/** `GET /api/stats/me` — the three stat cards. */
export async function getStats(token: string | null): Promise<Stats> {
  const s = await apiRequest<StatsRow>("/api/stats/me", token);
  return {
    canvasesCreated: s.canvases_created,
    canvasesCreatedThisWeek: s.canvases_created_this_week,
    tracesRun: s.traces_run,
    tracesRunThisWeek: s.traces_run_this_week,
    currentStreak: s.current_streak,
    longestStreak: s.longest_streak,
  };
}

export type NotificationItem = {
  id: string;
  author: string;
  postTitle: string;
  excerpt: string;
  time: string;
};

type NotificationRow = {
  id: string;
  author: string;
  post_title: string;
  excerpt: string;
  time: string;
};

/** `GET /api/notifications` — comments on the caller's own posts. */
export async function getNotifications(token: string | null): Promise<NotificationItem[]> {
  const rows = await apiRequest<NotificationRow[]>("/api/notifications", token);
  return rows.map((n) => ({
    id: n.id,
    author: n.author,
    postTitle: n.post_title,
    excerpt: n.excerpt,
    time: n.time,
  }));
}
