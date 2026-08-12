import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import type { TraceEvent } from "@/lib/trace-schema/types";

/** Lightweight row for the canvases quick-switcher — see `CanvasesMenu`. */
export type CanvasSummary = {
  id: string;
  name: string;
  language: Language;
  updated_at: string;
  step_count: number;
};

/** Full saved Visualizer workspace: code, language, last trace, compile
 * status, and the step the user was last looking at. */
export type Canvas = {
  id: string;
  owner_id: string;
  name: string;
  language: Language;
  source_code: string;
  trace_data: TraceEvent[] | null;
  stdout: string | null;
  compile_command: string | null;
  compiler_output: string | null;
  truncated: boolean;
  step_index: number;
  created_at: string;
  updated_at: string;
};

export type CanvasPatch = {
  name?: string;
  language?: Language;
  source_code?: string;
  step_index?: number;
};

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `canvas request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function listCanvases(token: string | null) {
  return request<CanvasSummary[]>("/api/canvases", token);
}

export function createCanvas(token: string | null, init?: { name?: string; language?: Language }) {
  return request<Canvas>("/api/canvases", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(init ?? {}),
  });
}

export function getCanvas(id: string, token: string | null) {
  return request<Canvas>(`/api/canvases/${encodeURIComponent(id)}`, token);
}

export function updateCanvas(id: string, patch: CanvasPatch, token: string | null) {
  return request<Canvas>(`/api/canvases/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteCanvas(id: string, token: string | null) {
  return request<void>(`/api/canvases/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}
