import { headers } from "next/headers";

/**
 * A best-effort "this request came from a phone" check, for server
 * components that would otherwise *create* something before the client
 * ever gets a say.
 *
 * Deliberately not the general mechanism for hiding the canvas features —
 * that's the viewport breakpoint (see `lib/use-wide-viewport.ts` and the
 * `wide`/`narrow` variants in `globals.css`), which measures the thing
 * that actually matters and stays right when the window is resized or the
 * page is zoomed. User-agent sniffing can't do either.
 *
 * It's used only where a viewport check arrives too late to help: the
 * Visualizer and Code-Canvas entry routes POST a brand-new workspace when
 * you have none, and doing that for a visitor who is about to be told the
 * feature needs a bigger screen leaves real rows in their account.
 */
export async function isMobileRequest() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  // Narrow on purpose: `Mobile` is the token phones set and tablets
  // (iPad, Android tablets in desktop mode) generally don't, and tablets
  // are supposed to reach these routes.
  return /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(
    userAgent,
  );
}
