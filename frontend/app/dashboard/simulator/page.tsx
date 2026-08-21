import CodeFlowSimulator from "@/components/dashboard/CodeFlowSimulator";
import WorkspaceGate from "@/components/dashboard/WorkspaceGate";

export default function SimulatorPage() {
  return (
    <WorkspaceGate feature="Simulator">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-5">
        <div>
          <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Simulator
          </span>
          <h1 className="text-balance mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Code-flow simulator.
          </h1>
          <p className="mt-2 max-w-xl font-serif text-[15px] text-[var(--text-secondary)]">
            Paste a snippet and step through the trace it builds, node by node.
            C++ only for now &mdash; JavaScript and Python support is coming soon.
          </p>
        </div>

        {/* Floor under the editor/diagram pair: they stack on a narrow
          * window, and a bare `flex-1` would let each half collapse to a
          * few pixels rather than pushing the page into a scroll. */}
        <div className="min-h-[30rem] flex-1">
          <CodeFlowSimulator />
        </div>
      </div>
    </WorkspaceGate>
  );
}
