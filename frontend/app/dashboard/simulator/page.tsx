import CodeFlowSimulator from "@/components/dashboard/CodeFlowSimulator";
import WorkspaceGate from "@/components/dashboard/WorkspaceGate";

export default function SimulatorPage() {
  // No wrapper of its own: the simulator is a full-height workspace and
  // owns its `max-w-7xl` frame directly, matching `/dashboard`. The only
  // horizontal padding on either page is the gutter `main` already keeps
  // clear of the sidebar rail.
  return (
    <WorkspaceGate feature="Simulator">
      <CodeFlowSimulator />
    </WorkspaceGate>
  );
}
