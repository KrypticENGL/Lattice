import type { ExecuteErrorResponse, ExecuteResponse } from "./types";

export class ExecuteRequestError extends Error {}

/**
 * POST /api/execute (BLUEPRINT.md §11). Relative URL — `next.config.ts`
 * proxies `/api/*` to the Rust backend in dev, so this works from the
 * browser without knowing the backend's actual origin.
 *
 * The backend verifies `token` (a Clerk session token — see
 * `useAuth().getToken()`) to identify the caller for the per-user
 * container quota, so callers must fetch one before calling this.
 *
 * A run writes nothing: the backend stores no canvases and no traces, so
 * the result is the caller's to keep (the Visualizer holds it in state,
 * and `lib/canvases.ts` saves only the source you typed).
 *
 * `fullSteps` asks for an event per stepped line instead of only the ones
 * that change the heap. The Simulator wants it (its call-stack and locals
 * panels change on precisely the steps the default filter drops — a
 * recursion that never allocates otherwise arrives as one flat event); the
 * Visualizer does not, because its diagram only redraws when the heap
 * does. Off by default, so the bigger payload is opt-in.
 */
export async function runTrace(
  language: string,
  source: string,
  token: string | null,
  fullSteps = false,
): Promise<ExecuteResponse> {
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ language, source, full_steps: fullSteps }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (body as ExecuteErrorResponse | null)?.error ?? `request failed (${res.status})`;
    throw new ExecuteRequestError(message);
  }

  return body as ExecuteResponse;
}
