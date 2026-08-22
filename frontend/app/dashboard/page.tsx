import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import StatCard from "@/components/dashboard/StatCard";
import Greeting from "@/components/dashboard/Greeting";
import ResourceMonitor from "@/components/dashboard/ResourceMonitor";
import Notifications from "@/components/dashboard/Notifications";
import CanvasesMenu from "@/components/dashboard/CanvasesMenu";
import NewCanvasButton from "@/components/dashboard/NewCanvasButton";
import RecentTraces from "@/components/dashboard/RecentTraces";
import { STATS } from "@/lib/dashboard-data";

export default function YouPage() {
  return (
    // Two sizing modes, because two things are true at once.
    //
    // At `xl` the two-column layout is meant to be a dashboard: one screen,
    // no page scroll, panels scrolling internally where they have more rows
    // than room. That needs a *definite* height — with only `min-h-full`
    // the grid sizes to max-content, `flex-1` never binds, and the panels
    // each take their full intrinsic height (Recent traces alone claimed
    // 612px) until the page runs 300px past the viewport.
    //
    // Below `xl` the panels stack into one column and no amount of
    // shrinking fits five of them on a phone screen, so there it keeps the
    // `min-h-full` behaviour: grow, and let the document scroll.
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-3 xl:h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            You
          </span>
          <Greeting />
          <p className="mt-1.5 font-serif text-[13px] text-[var(--text-secondary)]">
            Here&rsquo;s what you&rsquo;ve been building.
          </p>
        </div>

        {/* Canvases and new-canvas both lead to the Visualizer, which is a
          * wide-viewport workspace — offering them on a phone would only
          * route the user into the "needs a bigger canvas" wall. */}
        <div className="hidden items-center gap-2.5 wide:flex">
          <CanvasesMenu />
          <NewCanvasButton />
        </div>
      </div>

      {/* An explicit `minmax(0, 1fr)` row, not the implicit `auto` one: an
        * auto row is sized to its max-content and overflows a fixed-height
        * grid rather than making its items shrink, which would undo the
        * definite height established above. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr_288px] xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid shrink-0 gap-3 sm:grid-cols-3">
            {STATS.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          <div className="shrink-0">
            <ActivityHeatmap />
          </div>

          {/* A floor under the internally-scrolling list — without it the
            * flex chain happily hands it 0px on a short viewport and the
            * whole panel disappears. Deliberately modest: the floor is the
            * point at which the page gives up and scrolls, so setting it
            * to the panel's comfortable size defeats the purpose. */}
          <div className="min-h-[8.5rem] flex-1">
            <RecentTraces />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {/* Fixed to its content; Notifications takes the remainder. */}
          <div className="shrink-0">
            <ResourceMonitor />
          </div>

          <div className="min-h-[8.5rem] flex-1">
            <Notifications />
          </div>
        </div>
      </div>
    </div>
  );
}
