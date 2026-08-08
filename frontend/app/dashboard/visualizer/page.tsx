import ComingSoon from "@/components/dashboard/ComingSoon";

export default function VisualizerPage() {
  return (
    <ComingSoon
      eyebrow="Visualizer"
      title="Code to visuals."
      description="Paste any snippet and watch Lattice trace its real execution into an animated data-structure diagram — the same engine that powers the landing page demo, now built into your workstation."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12c2.5-4.5 6-6.8 10-6.8s7.5 2.3 10 6.8c-2.5 4.5-6 6.8-10 6.8S4.5 16.5 2 12z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      }
    />
  );
}
