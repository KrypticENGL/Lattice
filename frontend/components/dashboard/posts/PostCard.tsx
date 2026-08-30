"use client";

import { useState } from "react";
import Link from "next/link";
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
 * One post in the feed: the canvas it is about, enough of the writing to
 * decide by, and the three things a reader can do to it.
 *
 * The canvas leads. These posts exist because somebody traced something
 * and wants to show it, so the diagram is the headline image and the prose
 * is what explains it — not the other way round, which is how a feed of
 * technical writing turns into a wall of grey text nobody scrolls.
 *
 * The card is a doorway, not the post. It shows the opening paragraph and
 * links the rest to `/dashboard/posts/<id>`, where the whole piece is
 * shown alongside who wrote it. It used to unfold in place instead, which
 * meant the only way to read a post was to make the feed around it longer,
 * and nothing you read could be linked to or come back to.
 */
export default function PostCard({ post }: { post: Post }) {
  const { liked, saved, likeCount, comments } = usePostView(post);
  const { toggleLike, toggleSave } = usePostActions();
  const [showComments, setShowComments] = useState(false);

  const [lead, ...rest] = post.body;

  return (
    // `relative`, because the title's link stretches an ::after over the
    // whole card so that clicking anywhere on it opens the post. Anything
    // that has its own click — the save buttons, the action bar, the
    // comment thread — is lifted over that sheet with `relative z-10`.
    <article className="matte relative flex flex-col overflow-hidden rounded-2xl">
      <header className="flex items-start gap-3 p-5 pb-4">
        <PostByline post={post} />

        {/* The save control is duplicated up here and in the action bar on
          * purpose. This is the one action a reader takes without having
          * read the post — the whole point of a bookmark is "not now" —
          * and making them scroll past the thing they are deferring to
          * defer it is exactly backwards. */}
        <button
          type="button"
          onClick={() => toggleSave(post.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove "${post.title}" from saved` : `Save "${post.title}"`}
          className="relative z-10 -mr-1 -mt-1 shrink-0 rounded-full p-2 transition-colors hover:bg-white/5"
          style={{ color: saved ? "var(--accent-secondary)" : "var(--text-secondary)" }}
        >
          <BookmarkIcon filled={saved} />
        </button>
      </header>

      <h2 className="px-5 font-serif text-[19px] font-bold leading-snug text-[var(--text-primary)]">
        {/* The whole card is this link's hit area. Written as a real link
          * around the title rather than an invisible one laid over the
          * card, so the thing announced to a screen reader — and the thing
          * on the other end of a middle-click or a copied address — is the
          * post's title, not "read more". */}
        <Link
          href={`/dashboard/posts/${post.id}`}
          className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-[var(--accent-secondary)]"
        >
          {post.title}
        </Link>
      </h2>

      <PostCanvasFigure post={post} className="mx-5 mt-4" />

      <div className="px-5 pt-4">
        <p className="font-serif text-[14px] leading-7 text-[var(--text-secondary)]">{lead}</p>

        {/* Deliberately not a second link: the card already is one, and a
          * duplicate landing on the same address is one more stop for
          * anyone tabbing through the feed and nothing at all for
          * everyone else. It is here to say the post continues. */}
        {rest.length > 0 && (
          <span
            aria-hidden
            className="mt-2 inline-block font-mono text-[11px] uppercase tracking-wider"
            style={{ color: "var(--accent-secondary)" }}
          >
            Read post &rarr;
          </span>
        )}

        <PostTags post={post} className="mt-3.5" />
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-1 border-t border-[var(--hairline)] px-3.5 py-2.5">
        <ActionButton
          active={liked}
          activeColor="#f87171"
          label={liked ? `Unlike "${post.title}"` : `Like "${post.title}"`}
          count={likeCount}
          onClick={() => toggleLike(post.id)}
        >
          <HeartIcon filled={liked} />
        </ActionButton>

        <ActionButton
          active={showComments}
          activeColor="var(--text-primary)"
          label={`${showComments ? "Hide" : "Show"} comments on "${post.title}"`}
          count={comments.length}
          onClick={() => setShowComments((v) => !v)}
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

      {showComments && (
        <div className="relative z-10 px-5 pb-5">
          <CommentThread postId={post.id} comments={comments} />
        </div>
      )}
    </article>
  );
}
