"use client";

import { useEffect, useState } from "react";

/**
 * The one place the workspace breakpoint is written in JavaScript. It has
 * to match the `wide`/`narrow` custom variants in `app/globals.css`
 * exactly — see the comment there for why both axes are checked.
 */
export const WIDE_VIEWPORT_QUERY = "(min-width: 720px) and (min-height: 520px)";

/**
 * Whether the viewport is big enough for a canvas workspace.
 *
 * Deliberately starts `true` and corrects itself in an effect rather than
 * reading `matchMedia` during render: the server has no viewport, and
 * guessing differently on the two sides is a hydration mismatch. Callers
 * are expected to pair this with the CSS `wide:` variant, which is
 * correct on the very first paint — the hook's job is only to stop
 * heavy, invisible components from staying mounted on a phone, not to
 * decide what the user sees.
 */
export function useWideViewport() {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(WIDE_VIEWPORT_QUERY);
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return wide;
}
