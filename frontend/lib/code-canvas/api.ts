/**
 * Code-Canvas node graphs — `/api/code-canvases`, stored in MongoDB.
 *
 * The graph travels as an opaque document: the backend stores what the
 * editor sends and hands it back unchanged, so a new block kind needs no
 * server change at all. The block vocabulary and the rules about which
 * wires are legal live in `./graph`, and the compiler in `./codegen`.
 */

import { apiRequest, jsonBody } from "@/lib/api";
import { generateCpp } from "./codegen";
import type { CanvasGraph } from "./graph";

/** A saved node graph. */
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
   * canvas was left exactly as it was, resume step included. */
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

/** Compiles a graph without writing anything — the same function the code
 * pane renders from, so this is a local call, not a round trip. */
export function generateCode(graph: CanvasGraph): GeneratedCode {
  const generated = generateCpp(graph);
  return { source: generated.code, notes: generated.notes };
}

/**
 * Compiles the stored graph into its linked Visualizer canvas, creating
 * that canvas on first use, and answers with the id to navigate to.
 *
 * The C++ is compiled here and sent, rather than generated on the server:
 * `generateCpp` already runs on every keystroke to drive the code pane, so
 * keeping one implementation means what you watch being built is exactly
 * what runs. The server still reads the *stored* graph — to name the
 * canvas after it, and to prove the caller owns it — so a graph that was
 * never saved can't be visualized into somebody's workspace.
 *
 * Each graph keeps exactly one derived canvas, so pressing Visualize again
 * refreshes that canvas in place rather than littering the Visualizer.
 */
export async function visualizeCodeCanvas(
  id: string,
  graph: CanvasGraph,
  token: string | null,
): Promise<VisualizeResult> {
  const generated = generateCode(graph);
  const result = await apiRequest<{ canvas_id: string; outcome: VisualizeResult["outcome"] }>(
    `/api/code-canvases/${encodeURIComponent(id)}/visualize`,
    token,
    jsonBody("POST", { source: generated.source }),
  );
  return { ...result, ...generated };
}
