import CodeFlowSimulator from "@/components/dashboard/CodeFlowSimulator";

export default function SimulatorPage() {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-5">
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

      <div className="min-h-0 flex-1">
        <CodeFlowSimulator />
      </div>
    </div>
  );
}
