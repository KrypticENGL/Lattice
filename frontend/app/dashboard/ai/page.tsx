import ComingSoon from "@/components/dashboard/ComingSoon";

export default function AskAiPage() {
  return (
    <ComingSoon
      eyebrow="Ask our AI"
      title="Hermes, on call."
      description="An agent pipeline built on Hermes that reads your trace, your canvas, and your question together — so it can explain why a pointer moved, not just what a linked list is."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 4.6L18.5 9.4 13.8 11.2 12 16l-1.8-4.8L5.5 9.4l4.7-1.8L12 3z" />
          <path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
        </svg>
      }
    />
  );
}
