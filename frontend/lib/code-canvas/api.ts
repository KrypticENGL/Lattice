import { apiRequest, jsonBody } from "@/lib/api";
import type { CanvasGraph } from "./graph";

/** A saved node graph — `backend/src/code_canvas`. */
export type CodeCanvas = {
  id: string;
  owner_id: string;
  name: string;
  graph: CanvasGraph;
  created_at: string;
  updated_at: string;
};

/** Row for the graph switcher: counts, no graph payload. */
export type CodeCanvasSummary = {
  id: string;
  name: string;
  node_count: number;
  edge_count: number;
  updated_at: string;
};

export type GeneratedCode = {
  source: string;
  /** Parts of the graph that couldn't be compiled. Never an error. */
  notes: string[];
};

export type VisualizeResult = GeneratedCode & {
  canvas_id: string;
  /** `created` on the first Visualize for a graph, `refreshed` when the
   * generated code changed, `unchanged` when it didn't — in which case the
   * trace already on that canvas is still valid and was left alone. */
  outcome: "created" | "refreshed" | "unchanged";
};

export function listCodeCanvases(token: string | null) {
  return apiRequest<CodeCanvasSummary[]>("/api/code-canvases", token);
}

export function createCodeCanvas(
  token: string | null,
  init?: { name?: string; graph?: CanvasGraph },
) {
  return apiRequest<CodeCanvas>("/api/code-canvases", token, jsonBody("POST", init ?? {}));
}

export function getCodeCanvas(id: string, token: string | null) {
  return apiRequest<CodeCanvas>(`/api/code-canvases/${encodeURIComponent(id)}`, token);
}

export function updateCodeCanvas(
  id: string,
  patch: { name?: string; graph?: CanvasGraph },
  token: string | null,
) {
  return apiRequest<CodeCanvas>(
    `/api/code-canvases/${encodeURIComponent(id)}`,
    token,
    jsonBody("PATCH", patch),
  );
}

export function deleteCodeCanvas(id: string, token: string | null) {
  return apiRequest<void>(`/api/code-canvases/${encodeURIComponent(id)}`, token, {
    method: "DELETE",
  });
}

/**
 * Compiles the stored graph into its linked Visualizer canvas, creating
 * that canvas on first use, and answers with the id to navigate to.
 *
 * One call rather than the create-then-PATCH pair this used to do from the
 * browser: the backend generates from the graph it already has, so the
 * code that lands in the Visualizer is the code the *stored* graph
 * compiles to, not whatever the tab happened to have in memory.
 */
export function visualizeCodeCanvas(id: string, token: string | null) {
  return apiRequest<VisualizeResult>(
    `/api/code-canvases/${encodeURIComponent(id)}/visualize`,
    token,
    { method: "POST" },
  );
}
