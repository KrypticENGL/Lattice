"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createCanvas } from "@/lib/canvases";

export default function NewCanvasButton() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    setCreating(true);
    try {
      const token = await getToken();
      const canvas = await createCanvas(token);
      router.push(`/dashboard/visualizer/${canvas.id}`);
    } catch {
      // Best-effort UX: just let the user try again rather than surfacing
      // a dedicated error state for a single button.
      setCreating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={creating}
      className="rounded-full px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)] disabled:opacity-60"
      style={{ background: "var(--accent-primary)" }}
    >
      {creating ? "Creating…" : "+ New canvas"}
    </button>
  );
}
