/**
 * Shared fetch wrapper for the Rust backend.
 *
 * Every dashboard route reaches the backend through the same relative
 * `/api/*` path (rewritten in `next.config.ts`), with the caller's Clerk
 * token attached, and every failure comes back as `{ "error": "..." }` —
 * so error extraction belongs in one place rather than in each client.
 */
export async function apiRequest<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** `POST`/`PATCH` with a JSON body — the shape almost every write uses. */
export function jsonBody(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
