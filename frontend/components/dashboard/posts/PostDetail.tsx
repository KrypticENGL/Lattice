"use client";

import { useRef } from "react";
import CommentThread from "./CommentThread";
import {
  ActionButton,
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  PostByline,
  PostCanvasFigure,
  PostTags,
} from "./PostChrome";
import { usePostActions, usePostView } from "@/lib/posts/use-posts";
import type { Post } from "@/lib/posts/types";

/**
 * The post itself, at full length.
 *
 * Every piece it shares with the feed card comes from `PostChrome`, so
 * arriving here from a card is continuous — the same byline, the same
 * canvas, the same tags, in the same order — and the only differences are
 * the ones that are the point: the whole body rather than its opening
 * paragraph, and the comments open rather than folded away.
 */
export default function PostDetail({ post, className = "" }: { post: Post; className?: string }) {
  const { liked, saved, likeCount, comments } = usePostView(post);
  const { toggleLike, toggleSave } = usePostActions();
  const commentsRef = useRef<HTMLDivElement>(null);

  return (
    <article className={`matte flex flex-col overflow-hidden rounded-2xl ${className}`}>
      <header className="flex items-start gap-3 p-5 pb-4">
        <PostByline post={post} />

        <button
          type="button"
          onClick={() => toggleSave(post.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove "${post.title}" from saved` : `Save "${post.title}"`}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 transition-colors hover:bg-white/5"
          style={{ color: saved ? "var(--accent-secondary)" : "var(--text-secondary)" }}
        >
          <BookmarkIcon filled={saved} />
        </button>
      </header>

      {/* The post's title is this page's heading, at the same size the
        * feed's own heading uses — one type scale across the dashboard. */}
      <h1 className="px-5 font-serif text-xl font-black leading-tight tracking-tight text-[var(--text-primary)] xl:text-3xl">
        {post.title}
      </h1>

      <PostCanvasFigure post={post} className="mx-5 mt-4" />

      <div className="px-5 pt-4">
        {post.body.map((paragraph, i) => (
          <p
            key={i}
            className={`font-serif text-[14px] leading-7 text-[var(--text-secondary)] ${i > 0 ? "mt-3" : ""}`}
          >
            {paragraph}
          </p>
        ))}

        <PostTags post={post} className="mt-4" />
      </div>

      <div className="mt-4 flex items-center gap-1 border-t border-[var(--hairline)] px-3.5 py-2.5">
        <ActionButton
          active={liked}
          activeColor="#f87171"
          label={liked ? `Unlike "${post.title}"` : `Like "${post.title}"`}
          count={likeCount}
          onClick={() => toggleLike(post.id)}
        >
          <HeartIcon filled={liked} />
        </ActionButton>

        {/* Nothing to toggle here — the thread is already open — so the
          * button does the only useful thing left: takes you to it. */}
        <ActionButton
          active={false}
          activeColor="var(--text-primary)"
          label={`Go to comments on "${post.title}"`}
          count={comments.length}
          onClick={() => commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <CommentIcon />
        </ActionButton>

        <ActionButton
          active={saved}
          activeColor="var(--accent-secondary)"
          label={saved ? `Remove "${post.title}" from saved` : `Save "${post.title}"`}
          onClick={() => toggleSave(post.id)}
        >
          <BookmarkIcon filled={saved} />
          <span>{saved ? "Saved" : "Save"}</span>
        </ActionButton>
      </div>

      <div ref={commentsRef} className="scroll-mt-4 px-5 pb-5">
        <CommentThread postId={post.id} comments={comments} />
      </div>
    </article>
  );
}
