import { apiRequest, jsonBody } from "@/lib/api";
import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import type { TraceEvent } from "@/lib/trace-schema/types";

/** Where a canvas came from. `code_canvas` marks one Lattice generated
 * from a Code-Canvas graph — its code is derived, so it's read-only for as
 * long as `code_canvas_id` still points at that graph. */
export type CanvasOrigin = "user" | "code_canvas";

/** Lightweight row for the canvases quick-switcher — see `CanvasesMenu`. */
export type CanvasSummary = {
  id: string;
  name: string;
  language: Language;
  updated_at: string;
  step_count: number;
  origin: CanvasOrigin;
  code_canvas_id: string | null;
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
  origin: CanvasOrigin;
  /** The graph this canvas was generated from. Non-null means the source
   * is derived and the server will reject edits to it (409); it goes null
   * if that graph is later deleted, which unlocks editing again. */
  code_canvas_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CanvasPatch = {
  name?: string;
  language?: Language;
  source_code?: string;
  step_index?: number;
};

export function listCanvases(token: string | null) {
  return apiRequest<CanvasSummary[]>("/api/canvases", token);
}

export function createCanvas(token: string | null, init?: { name?: string; language?: Language }) {
  return apiRequest<Canvas>("/api/canvases", token, jsonBody("POST", init ?? {}));
}

export function getCanvas(id: string, token: string | null) {
  return apiRequest<Canvas>(`/api/canvases/${encodeURIComponent(id)}`, token);
}

export function updateCanvas(id: string, patch: CanvasPatch, token: string | null) {
  return apiRequest<Canvas>(
    `/api/canvases/${encodeURIComponent(id)}`,
    token,
    jsonBody("PATCH", patch),
  );
}

export function deleteCanvas(id: string, token: string | null) {
  return apiRequest<void>(`/api/canvases/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}
