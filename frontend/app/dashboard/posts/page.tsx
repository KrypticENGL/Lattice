import Link from "next/link";
import PostFeed from "@/components/dashboard/posts/PostFeed";

export default function PostsPage() {
  return (
    // One column until there is genuinely room for two, on the same
    // threshold and at the same widths as a post's own page — the feed's
    // rail and that page's author card are the same idea, and a reader
    // moving between them should not find the column moving too. `xl`
    // rather than `lg` because the dashboard's navigation rail eats 208px
    // of every screen before this page gets any.
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 xl:max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* Same type as Code-Canvas's workspace title, at the same two
            * sizes: these are sibling pages in one dashboard, and a feed
            * that announced itself in a heavier serif than the workspaces
            * read as a different product. */}
          <h1 className="font-serif text-xl font-black tracking-tight text-[var(--text-primary)] xl:text-3xl">
            Posts
          </h1>
          {/* One line of what this is. Without it the page opened on a
            * single word and a wall of cards, and never said what the
            * cards were or what made them different from any other feed
            * of technical writing — which is the canvas attached to each. */}
          <p className="mt-1.5 max-w-xl font-serif text-[14px] leading-6 text-[var(--text-secondary)]">
            Traces people ran, and what they worked out from them. Every post carries the
            canvas behind it &mdash; take it away as a <code className="font-mono text-[13px]">.lattice</code>{" "}
            file and step through it yourself.
          </p>
        </div>

        {/* Somewhere to go, on a page that is otherwise only readable.
          * It links to where the canvases in these posts are actually
          * built rather than to a composer, because there is no composer
          * — a control that promised one would be lying about the only
          * thing it does. */}
        <Link
          href="/dashboard/code-canvas"
          title="Build a canvas in Code-Canvas — the posts here are made from these"
          className="rail-pill glass-flat inline-flex shrink-0 gap-2 rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
        >
          Trace something &rarr;
        </Link>
      </div>

      <PostFeed />
    </div>
  );
}
