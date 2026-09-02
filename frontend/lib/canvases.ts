/**
 * Visualizer workspaces — `/api/canvases`, stored in MongoDB.
 *
 * Same functions and signatures these have always had. The storage behind
 * them has moved twice (Postgres, then browser storage, now Mongo) and no
 * page above this file changed for any of it, which is the whole reason
 * the interface is kept this shape.
 */

import { apiRequest, jsonBody } from "@/lib/api";
import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";

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
  origin: CanvasOrigin;
  code_canvas_id: string | null;
};

/** Full saved Visualizer workspace: the code you typed, its language, and
 * the step you were last looking at.
 *
 * No trace, stdout, or compiler output — those are recomputed by a run and
 * returned from `/api/execute`, never stored. Reopening a canvas therefore
 * restores your code, not your last run. */
export type Canvas = {
  id: string;
  owner_id: string;
  name: string;
  language: Language;
  source_code: string;
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
