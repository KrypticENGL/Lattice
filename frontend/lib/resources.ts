export type ResourceUsage = {
  containers: { used: number; limit: number };
  cpu: { used_percent: number; limit_percent: number };
  memory: { used_bytes: number; limit_bytes: number };
};

/**
 * GET /api/resources — live sandbox usage for the signed-in user, backed by
 * Docker stats for their currently-running trace containers. Requires a
 * Clerk session token (see `useAuth().getToken()`); the backend 401s
 * without one.
 */
export async function getResourceUsage(token: string | null): Promise<ResourceUsage> {
  const res = await fetch("/api/resources", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `resource usage request failed (${res.status})`);
  }
  return res.json();
}
