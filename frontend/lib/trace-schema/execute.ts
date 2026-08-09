import type { ExecuteErrorResponse, ExecuteResponse } from "./types";

export class ExecuteRequestError extends Error {}

/**
 * POST /api/execute (BLUEPRINT.md §11). Relative URL — `next.config.ts`
 * proxies `/api/*` to the Rust backend in dev, so this works from the
 * browser without knowing the backend's actual origin.
 */
export async function runTrace(language: string, source: string): Promise<ExecuteResponse> {
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, source }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (body as ExecuteErrorResponse | null)?.error ?? `request failed (${res.status})`;
    throw new ExecuteRequestError(message);
  }

  return body as ExecuteResponse;
}
