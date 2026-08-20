import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { starterGraph } from "@/lib/code-canvas/graph";

/** Same default as `next.config.ts`'s dev proxy target — this runs on the
 * Next.js server itself, not in the browser, so it can't rely on that
 * rewrite (which only intercepts browser-originated requests). */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

/**
 * Bare `/dashboard/code-canvas` isn't itself a workspace — every visit
 * lives inside some graph. Hand off to the most recently modified one
 * (`GET /api/code-canvases` is already sorted `updated_at DESC`), so coming
 * back resumes what you were building instead of spawning an empty canvas
 * every time. Mirrors the Visualizer's own entry route.
 */
export default async function CodeCanvasEntryPage() {
  const { getToken } = await auth();
  const token = await getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const listRes = await fetch(`${BACKEND_URL}/api/code-canvases`, {
    headers,
    cache: "no-store",
  });
  if (!listRes.ok) {
    throw new Error(`Couldn't load your graphs (${listRes.status}).`);
  }
  const graphs: { id: string }[] = await listRes.json();
  if (graphs.length > 0) {
    redirect(`/dashboard/code-canvas/${graphs[0].id}`);
  }

  // Seeded with the worked example at creation, not on every load: an
  // empty graph has to be able to stay empty, or pressing Clear and coming
  // back would resurrect the starter.
  const createRes = await fetch(`${BACKEND_URL}/api/code-canvases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ graph: starterGraph() }),
    cache: "no-store",
  });
  if (!createRes.ok) {
    throw new Error(`Couldn't create a new graph (${createRes.status}).`);
  }
  const graph: { id: string } = await createRes.json();
  redirect(`/dashboard/code-canvas/${graph.id}`);
}
