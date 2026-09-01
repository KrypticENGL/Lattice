import CodeFlowSimulator from "@/components/dashboard/CodeFlowSimulator";
import WorkspaceGate from "@/components/dashboard/WorkspaceGate";

export default function SimulatorPage() {
  // No wrapper of its own: the simulator is a full-height workspace and
  // owns its frame directly. It runs edge to edge on the same terms the
  // Visualizer and Code-Canvas do — see `data-workspace-full-width` in
  // globals.css for the gutters that buys and the rail shift it owes.
  return (
    <WorkspaceGate feature="Simulator">
      <CodeFlowSimulator />
    </WorkspaceGate>
  );
}
