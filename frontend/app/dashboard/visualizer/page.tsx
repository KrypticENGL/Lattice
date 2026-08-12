import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** Same default as `next.config.ts`'s dev proxy target — this runs on the
 * Next.js server itself, not in the browser, so it can't rely on that
 * rewrite (which only intercepts browser-originated requests). */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

/**
 * Bare `/dashboard/visualizer` isn't itself a workspace — every visit lives
 * inside some canvas. Hand off to the most recently modified one
 * (`GET /api/canvases` is already sorted `updated_at DESC`), so coming back
 * to the Visualizer resumes where you left off instead of spawning a fresh
 * canvas on every visit. Only creates a new one when there's nothing to
 * resume yet.
 */
export default async function VisualizerEntryPage() {
  const { getToken } = await auth();
  const token = await getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const listRes = await fetch(`${BACKEND_URL}/api/canvases`, {
    headers,
    cache: "no-store",
  });
  if (!listRes.ok) {
    throw new Error(`Couldn't load your canvases (${listRes.status}).`);
  }
  const canvases: { id: string }[] = await listRes.json();
  if (canvases.length > 0) {
    redirect(`/dashboard/visualizer/${canvases[0].id}`);
  }

  const createRes = await fetch(`${BACKEND_URL}/api/canvases`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!createRes.ok) {
    throw new Error(`Couldn't create a new canvas (${createRes.status}).`);
  }
  const canvas: { id: string } = await createRes.json();
  redirect(`/dashboard/visualizer/${canvas.id}`);
}
