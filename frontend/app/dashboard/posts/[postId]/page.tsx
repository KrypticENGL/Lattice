import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AuthorProfileCard from "@/components/dashboard/posts/AuthorProfileCard";
import PostDetail from "@/components/dashboard/posts/PostDetail";
import { auth } from "@clerk/nextjs/server";
import { getAuthorProfile } from "@/lib/posts/authors";
import type { Post } from "@/lib/posts/types";

/**
 * One post, at its own address.
 *
 * A server component, even though everything the reader can *do* here is
 * client-side: the post can be fetched before anything is sent, so the
 * title and the prose are in the HTML, and only the parts that hold state
 * — the action bar, the comment thread — are client components
 * underneath. That also gives `generateMetadata` a real title to work
 * with, which a client-fetched post could not.
 */

/** Same default as `next.config.ts`'s dev proxy target — this runs on the
 * Next.js server itself, not in the browser, so it can't rely on that
 * rewrite (which only intercepts browser-originated requests). */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

type Props = { params: Promise<{ postId: string }> };

/** `undefined` for a post that isn't there *and* for a backend that
 * couldn't be reached: both mean this page has nothing to render, and the
 * 404 says so without inventing a distinction the reader can act on.
 *
 * `no-store` because the post carries the reader's own `liked`/`saved`
 * flags — a cached copy would show one reader's reactions to another.
 */
async function findPost(postId: string): Promise<Post | undefined> {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${BACKEND_URL}/api/posts/${encodeURIComponent(postId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) return undefined;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params;
  const post = await findPost(postId);
  return {
    title: post ? `${post.title} — Lattice` : "Post not found — Lattice",
    description: post?.body[0],
  };
}

export default async function PostPage({ params }: Props) {
  const { postId } = await params;
  const post = await findPost(postId);
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
