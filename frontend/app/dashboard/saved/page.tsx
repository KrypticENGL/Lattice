import SavedPostsGrid from "@/components/dashboard/SavedPostsGrid";

export default function SavedPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5">
      <div>
        <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Saved
        </span>
        <h1 className="text-balance mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
          Saved posts.
        </h1>
        <p className="mt-2 font-serif text-[15px] text-[var(--text-secondary)]">
          Everything you&rsquo;ve bookmarked from the community, in one place.
        </p>
      </div>

      <SavedPostsGrid />
    </div>
  );
}
