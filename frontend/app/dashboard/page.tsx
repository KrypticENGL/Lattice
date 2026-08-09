import { currentUser } from "@clerk/nextjs/server";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import StatCard from "@/components/dashboard/StatCard";
import Notifications from "@/components/dashboard/Notifications";
import CanvasesMenu from "@/components/dashboard/CanvasesMenu";
import RecentTraces from "@/components/dashboard/RecentTraces";
import MusicPlayer from "@/components/dashboard/MusicPlayer";
import CodeFlowSimulator from "@/components/dashboard/CodeFlowSimulator";
import SavedPosts from "@/components/dashboard/SavedPosts";
import { STATS } from "@/lib/dashboard-data";

export default async function YouPage() {
  const user = await currentUser();
  const name = user?.firstName ?? "there";

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            You
          </span>
          <h1 className="text-balance mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Welcome back, {name}.
          </h1>
          <p className="mt-2 font-serif text-[15px] text-[var(--text-secondary)]">
            Here&rsquo;s what you&rsquo;ve been building.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CanvasesMenu />
          <button
            type="button"
            className="rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)]"
            style={{ background: "var(--accent-primary)" }}
          >
            + New canvas
          </button>
        </div>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="shrink-0">
        <CodeFlowSimulator />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="shrink-0">
            <ActivityHeatmap />
          </div>

          <div className="min-h-0 flex-1">
            <RecentTraces />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-5">
          <div className="shrink-0">
            <Notifications />
          </div>

          <div className="shrink-0">
            <SavedPosts />
          </div>

          <div className="min-h-0 flex-1">
            <MusicPlayer />
          </div>
        </div>
      </div>
    </div>
  );
}
