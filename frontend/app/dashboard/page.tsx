import { currentUser } from "@clerk/nextjs/server";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import StatCard from "@/components/dashboard/StatCard";
import CanvasCard from "@/components/dashboard/CanvasCard";
import Notifications from "@/components/dashboard/Notifications";
import { CANVASES, STATS } from "@/lib/dashboard-data";

export default async function YouPage() {
  const user = await currentUser();
  const name = user?.firstName ?? "there";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            You
          </span>
          <h1 className="text-balance mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Welcome back, {name}.
          </h1>
          <p className="mt-2 font-serif text-[15px] text-[var(--text-secondary)]">
            Here&rsquo;s what you&rsquo;ve been building.
          </p>
        </div>

        <button
          type="button"
          className="rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)]"
          style={{ background: "var(--accent-primary)" }}
        >
          + New canvas
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px] xl:items-start">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          <ActivityHeatmap />

          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-[19px] font-bold text-[var(--text-primary)]">
                Your canvases
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                {CANVASES.length} total
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CANVASES.map((canvas) => (
                <CanvasCard key={canvas.id} canvas={canvas} />
              ))}
            </div>
          </div>
        </div>

        <Notifications />
      </div>
    </div>
  );
}
