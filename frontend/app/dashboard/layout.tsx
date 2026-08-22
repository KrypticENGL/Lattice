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
        * The gutter clears the rail *expanded*, not collapsed. It used to
        * clear only the 72px resting width, which meant hovering the rail
        * slid 150px of navigation straight over the page — the content
        * was never pushed aside, it was covered. Sized off the hover
        * width (192px) plus a margin, the rail now grows into empty
        * gutter and never reaches anything. On a 1536px screen this costs
        * nothing: the page caps at max-w-7xl and was already leaving that
        * space unused.
        *
        * `main` owns the scrolling, not the document — the dashboard's
        * chrome (rail, bar) is meant to stay put while the page moves.
        * `.viewport-shell` above stops that from becoming a trap: once
        * the viewport is too short to hold the shell's floor, the shell
        * keeps its height and the document scrolls it into reach. */}
      <main className="scrollbar-hide h-full min-h-0 overflow-y-auto pb-20 wide:pl-[208px] wide:pb-0">
        {children}
      </main>
    </div>
  );
}
