import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AuthorProfileCard from "@/components/dashboard/posts/AuthorProfileCard";
import PostDetail from "@/components/dashboard/posts/PostDetail";
import { getAuthorProfile } from "@/lib/posts/authors";
import { POSTS } from "@/lib/posts/data";

/**
 * One post, at its own address.
 *
 * A server component, even though everything the reader can *do* here is
 * client-side: the post is static seed data (see `lib/posts/data.ts`), so
 * it can be resolved before anything is sent, and only the parts that
 * hold state — the post body's action bar, the comment thread — are
 * client components underneath. When these come from the server this
 * `find` becomes a fetch and nothing above it changes.
 */

type Props = { params: Promise<{ postId: string }> };

function findPost(postId: string) {
  return POSTS.find((post) => post.id === postId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params;
  const post = findPost(postId);
  return {
    title: post ? `${post.title} — Lattice` : "Post not found — Lattice",
    description: post?.body[0],
  };
}

export default async function PostPage({ params }: Props) {
  const { postId } = await params;
  const post = findPost(postId);
  if (!post) notFound();

  const profile = getAuthorProfile(post.handle);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 xl:max-w-5xl">
      <Link
        href="/dashboard/posts"
        className="rail-pill glass-flat inline-flex w-fit gap-2 rounded-full px-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)]"
      >
        &larr; Posts
      </Link>

      {/* One column until there is genuinely room for two. The threshold is
        * `xl` rather than `lg` because the dashboard's navigation rail eats
        * 208px of every screen before this page gets any, so a viewport
        * wide enough for a sidebar on paper is not one in practice. */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <PostDetail post={post} className="min-w-0 flex-1" />

        {/* Sticky against `main`, which is what actually scrolls in the
          * dashboard shell — the document does not. Stacked under the post
          * on a narrow screen, where a profile is something you read after
          * the piece rather than beside it. */}
        <AuthorProfileCard
          post={post}
          profile={profile}
          className="w-full shrink-0 xl:sticky xl:top-0 xl:w-72"
        />
      </div>
    </div>
  );
}
