"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { WIDE_VIEWPORT_QUERY } from "@/lib/use-wide-viewport";
import { registerSectionScroller } from "@/lib/scroll-to-section";

/* Timing
   ------------------------------------------------------------------
   A panel move pans the whole viewport, which is a lot of pixels for the
   eye to track: it wants noticeably longer than an ordinary UI
   transition, and it wants to leave and arrive at rest rather than
   stopping dead. One panel takes BASE; longer jumps (a nav click that
   crosses the deck) get a little more time per panel so they read as
   travel rather than a cut, but never so much that they drag. */
const BASE_DURATION = 950;
const PER_EXTRA_PANEL = 180;
const MAX_DURATION = 1700;

/** Wheel silence, in ms, that separates one gesture from the next. */
const GESTURE_GAP = 140;
/** Accumulated wheel travel, in px, before a gesture commits to a panel. */
const COMMIT_THRESHOLD = 24;
/** Assumed line height for wheel events reported in lines rather than px. */
const LINE_HEIGHT = 16;

/**
 * Smootherstep: 6t⁵ − 15t⁴ + 10t³.
 *
 * The curve this replaced was `easeInOutCubic`, whose velocity peaks at
 * 3× the average — the panel lurches through the middle of the move, and
 * that mid-flight whip is what reads as "too fast" even at a duration
 * that measures as slow. Smootherstep peaks at only 1.875× and, unlike
 * the usual catalogue of ease-in-outs, has zero *acceleration* at both
 * ends as well as zero velocity. Nothing jerks into motion and nothing
 * slams to a halt; the panel gets under way and then settles.
 */
function smootherstep(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Wheel deltas arrive in pixels, lines, or pages depending on device. */
function wheelPixels(e: WheelEvent) {
  if (e.deltaMode === 1) return e.deltaY * LINE_HEIGHT;
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
  return e.deltaY;
}

export default function ScrollFrame({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Animation state. `frame` is the in-flight rAF handle, so a new
    // scroll (or an unmount) can take over cleanly instead of leaving two
    // animations writing scrollTop on alternate frames.
    let frame = 0;
    let animatingUntil = 0;

    // Gesture state. `armed` is the one-panel-per-gesture gate: it closes
    // when a move commits and reopens only once the wheel falls silent,
    // so the inertia tail of a trackpad fling can't fire off three more
    // panels the moment the animation ends. That runaway was the other
    // half of "too fast" — a single flick used to cost several screens.
    let armed = true;
    let lastWheelAt = 0;
    let accumulated = 0;

    function land() {
      frame = 0;
      animatingUntil = 0;
      // Snapping comes back only once we're exactly on a panel edge, so
      // the browser has nothing left to correct and the move ends silently.
      el!.style.scrollSnapType = "";
    }

    function animateTo(target: number) {
      const start = el!.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) return;

      if (frame) cancelAnimationFrame(frame);

      if (reduceMotion.matches) {
        el!.scrollTop = target;
        land();
        return;
      }

      // Mandatory scroll-snap fights direct scrollTop writes and forcibly
      // snaps once a value crosses the midpoint, cutting the animation
      // short. Suspend it for the duration of the JS-driven scroll and
      // restore it once we've come to rest exactly on the target panel.
      el!.style.scrollSnapType = "none";

      const panels = Math.abs(distance) / Math.max(el!.clientHeight, 1);
      const duration = Math.min(
        BASE_DURATION + Math.max(0, panels - 1) * PER_EXTRA_PANEL,
        MAX_DURATION,
      );

      const startTime = performance.now();
      animatingUntil = startTime + duration;

      function step(now: number) {
        const t = Math.min((now - startTime) / duration, 1);
        el!.scrollTop = start + distance * smootherstep(t);
        if (t < 1) {
          frame = requestAnimationFrame(step);
        } else {
          land();
        }
      }
      frame = requestAnimationFrame(step);
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
      const newGesture = now - lastWheelAt > GESTURE_GAP;
      lastWheelAt = now;
      if (newGesture) {
        accumulated = 0;
        armed = true;
      }

      // Still gliding, or still riding out the gesture that started the
      // glide: absorb the event rather than queueing another move.
      if (!armed || now < animatingUntil) {
        accumulated = 0;
        return;
      }

      // A stray pixel or two shouldn't cost a whole screen; wait until the
      // gesture has clearly committed to a direction.
      accumulated += wheelPixels(e);
      if (Math.abs(accumulated) < COMMIT_THRESHOLD) return;

      const panelHeight = el!.clientHeight;
      const current = Math.round(el!.scrollTop / panelHeight);
      const maxIndex = Math.max(0, Math.round(el!.scrollHeight / panelHeight) - 1);
      const direction = accumulated > 0 ? 1 : -1;
      const target = Math.min(Math.max(current + direction, 0), maxIndex);

      accumulated = 0;
      if (target === current) return;

      armed = false;
      animateTo(target * panelHeight);
    }

    /**
     * Nav and CTA jumps, routed through the same curve as the wheel so the
     * page only ever moves one way. Snapping viewports round to the panel
     * edge; taller-than-screen ones scroll to the section itself.
     */
    function scrollToElement(target: HTMLElement) {
      if (!el!.contains(target)) return false;

      const offset =
        el!.scrollTop +
        target.getBoundingClientRect().top -
        el!.getBoundingClientRect().top;
      const panelHeight = el!.clientHeight;
      const destination = shouldSnap()
        ? Math.round(offset / panelHeight) * panelHeight
        : offset;
      const maxScroll = Math.max(0, el!.scrollHeight - el!.clientHeight);

      // A click is its own gesture: it shouldn't be swallowed by a wheel
      // gate left closed by whatever the user did just before.
      armed = true;
      accumulated = 0;
      animateTo(Math.min(Math.max(destination, 0), maxScroll));
      return true;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    const unregister = registerSectionScroller(scrollToElement);

    return () => {
      el.removeEventListener("wheel", onWheel);
      unregister();
      if (frame) cancelAnimationFrame(frame);
      el.style.scrollSnapType = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="snap-container scrollbar-hide px-4 sm:px-8 lg:px-12"
    >
      {children}
    </div>
  );
}
