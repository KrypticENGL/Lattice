import ComingSoon from "@/components/dashboard/ComingSoon";

export default function CodeCanvasPage() {
  return (
    <ComingSoon
      eyebrow="Code-Canvas"
      title="Build by connecting nodes."
      description="A free-form workspace where you drag out nodes for data structures and operations, wire up the connections, and generate real, runnable code from the graph you build."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="7" r="2.1" />
          <circle cx="18" cy="7" r="2.1" />
          <circle cx="12" cy="18" r="2.1" />
          <path d="M7.7 8.6L10.5 16M16.3 8.6L13.5 16M8.1 7h7.8" />
        </svg>
      }
    />
  );
}
