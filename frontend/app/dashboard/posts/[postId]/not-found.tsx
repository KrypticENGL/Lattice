import Link from "next/link";

/** Reached by `notFound()` above when the address names a post that isn't
 * there — a stale bookmark, or a hand-typed id. Kept inside the dashboard
 * chrome rather than falling through to the framework's bare 404, so the
 * way back is one click and not the browser's back button. */
export default function PostNotFound() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
        404
      </p>
      <h1 className="font-serif text-xl font-black tracking-tight text-[var(--text-primary)] xl:text-3xl">
        No such post
      </h1>
      <p className="font-serif text-[14px] leading-7 text-[var(--text-secondary)]">
        It may have been taken down, or the address may be wrong.
      </p>
      <Link
        href="/dashboard/posts"
        className="rail-pill glass-flat mt-1 inline-flex gap-2 rounded-full px-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
      >
        &larr; Back to Posts
      </Link>
    </div>
  );
}
