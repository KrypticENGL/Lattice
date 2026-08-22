/**
 * Jumping to a named section of the landing page.
 *
 * `scrollIntoView({ behavior: "smooth" })` is the obvious implementation
 * and it's the wrong one here: its curve and duration belong to the
 * browser, so a nav click lands with a completely different feel from a
 * wheel gesture on the very same deck of panels — and inside a
 * mandatory-snap container it tends to cut the glide short and snap the
 * last stretch itself.
 *
 * So the panel deck registers its own animator (see `ScrollFrame`) and
 * takes these calls when it can. `scrollIntoView` stays as the fallback
 * for anything the deck doesn't own, and for the moment before hydration.
 */

/** Returns true if it handled the scroll, false to fall back. */
type SectionScroller = (target: HTMLElement) => boolean;

let scroller: SectionScroller | null = null;

/** Registers the panel-deck animator. Returns an unregister function. */
export function registerSectionScroller(fn: SectionScroller) {
  scroller = fn;
  return () => {
    if (scroller === fn) scroller = null;
  };
}

export function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  if (scroller?.(target)) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}
