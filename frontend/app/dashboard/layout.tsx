import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import Sidebar from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  return (
    <div className="viewport-shell relative bg-[var(--bg-base)] p-4 sm:p-6">
      <Sidebar />
      {/* Clearance for whichever navigation is on screen: a left gutter
        * for the wide rail, a bottom gutter for the compact bar. Both are
        * fixed overlays, so this padding is the only thing keeping page
        * content out from underneath them.
        *
        * The left gutter clears the rail *expanded*, not collapsed. It
        * used to clear only the 72px resting width, which meant hovering
        * the rail slid 150px of navigation straight over the page — the
        * content was never pushed aside, it was covered. Sized off the
        * hover width (192px) plus a margin, the rail now grows into empty
        * gutter and never reaches anything.
        *
        * The right gutter matches it for one reason only: so the page has
        * the same padding on both sides. Nothing sits in it. Without it a
        * dashboard page is padded 208px on the left and 0 on the right —
        * which stayed invisible only while every page was narrower than
        * the room it had. `/dashboard` caps at `max-w-7xl`, exactly the
        * 1280px left over on a 1536px screen, so it had no centring slack
        * at all and sat flush against the right edge. Mirroring the
        * padding is what keeps a page centred in its frame at any width;
        * `mx-auto` on the page can only centre within what it's given.
        *
        * `main` owns the scrolling, not the document — the dashboard's
        * chrome (rail, bar) is meant to stay put while the page moves.
        * `.viewport-shell` above stops that from becoming a trap: once
        * the viewport is too short to hold the shell's floor, the shell
        * keeps its height and the document scrolls it into reach. */}
      <main className="scrollbar-hide h-full min-h-0 overflow-y-auto pb-20 wide:pl-[208px] wide:pr-[208px] wide:pb-0">
        {children}
      </main>
    </div>
  );
}
