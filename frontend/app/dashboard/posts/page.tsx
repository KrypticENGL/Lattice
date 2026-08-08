import ComingSoon from "@/components/dashboard/ComingSoon";

export default function PostsPage() {
  return (
    <ComingSoon
      eyebrow="Posts"
      title="Written by the people using it."
      description="A space for the community to share traces, write-ups, and patterns they've found — so the next person debugging the same linked list bug doesn't start from zero."
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3.5h11l3.5 3.5V20a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
          <path d="M16 3.5V7h3.5" />
          <path d="M8 12h8M8 15.5h8M8 8.5h4" />
        </svg>
      }
    />
  );
}
