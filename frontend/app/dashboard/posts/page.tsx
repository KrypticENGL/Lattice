import PostFeed from "@/components/dashboard/posts/PostFeed";

export default function PostsPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5">
      <div className="mx-auto w-full max-w-2xl">
        {/* Same type as Code-Canvas's workspace title, at the same two
          * sizes: these are sibling pages in one dashboard, and a feed
          * that announced itself in a heavier serif than the workspaces
          * read as a different product. */}
        <h1 className="font-serif text-xl font-black tracking-tight text-[var(--text-primary)] xl:text-3xl">
          Posts
        </h1>
      </div>

      <PostFeed />
    </div>
  );
}
