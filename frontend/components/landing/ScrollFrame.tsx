"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { WIDE_VIEWPORT_QUERY } from "@/lib/use-wide-viewport";

const DURATION = 900;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function ScrollFrame({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedUntilRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function animateTo(target: number) {
      const start = el!.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) return;

      // Mandatory scroll-snap fights direct scrollTop writes and forcibly
      // snaps once a value crosses the midpoint, cutting the animation
      // short. Suspend it for the duration of the JS-driven scroll and
      // restore it once we've come to rest exactly on the target panel.
      el!.style.scrollSnapType = "none";

      const startTime = performance.now();
      function step(now: number) {
        const t = Math.min((now - startTime) / DURATION, 1);
        el!.scrollTop = start + distance * easeInOutCubic(t);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          el!.style.scrollSnapType = "";
        }
      }
      requestAnimationFrame(step);
    }

    /**
     * Whether one-panel-per-gesture is appropriate right now.
     *
     * Hijacking the wheel is only defensible while a panel really is one
     * screen tall, because the gesture then has nothing else it could
     * have meant. Two situations break that, and both used to leave
     * content permanently out of reach:
     *
     *  - Below the workspace breakpoint the sections are taller than the
     *    viewport by design (see `.snap-panel` in globals.css).
     *  - Zoomed in, *every* section outgrows the viewport.
     *
     * The measurement covers both without having to special-case either:
     * if the panels together are taller than one screen each, the wheel
     * goes back to being an ordinary scroll.
     */
    function shouldSnap() {
      if (!window.matchMedia(WIDE_VIEWPORT_QUERY).matches) return false;
      const panels = el!.children.length;
      if (panels === 0) return false;
      // 2px of slack for sub-pixel rounding on fractional zoom levels.
      return el!.scrollHeight <= el!.clientHeight * panels + 2;
    }

    function onWheel(e: WheelEvent) {
      // Ctrl/⌘+wheel is the browser's zoom gesture (and a trackpad pinch,
      // which arrives as exactly the same event). Swallowing it here is
      // what made the landing page impossible to zoom.
      if (e.ctrlKey || e.metaKey) return;
      if (!shouldSnap()) return;

      e.preventDefault();
      const now = performance.now();
      if (now < lockedUntilRef.current) return;

      const panelHeight = el!.clientHeight;
      const current = Math.round(el!.scrollTop / panelHeight);
      const maxIndex = Math.max(0, Math.round(el!.scrollHeight / panelHeight) - 1);
      const direction = e.deltaY > 0 ? 1 : -1;
      const target = Math.min(Math.max(current + direction, 0), maxIndex);

      if (target === current) return;

      lockedUntilRef.current = now + DURATION;
      animateTo(target * panelHeight);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="snap-container scrollbar-hide px-4 sm:px-10 lg:px-16"
    >
      {children}
    </div>
  );
}
