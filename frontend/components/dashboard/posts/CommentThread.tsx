"use client";

import { useState, type FormEvent } from "react";
import { commentAge, initials, usePostActions } from "@/lib/posts/use-posts";
import type { PostComment } from "@/lib/posts/types";

/**
 * The replies under one post, plus the box for adding another.
 *
 * Seeded comments and the reader's own render identically apart from the
 * delete control, which only appears on comments this browser wrote. The
 * alternative — styling yours as a visibly different kind of object — makes
 * a thread read as two conversations rather than one.
 */

const MAX_COMMENT_LENGTH = 600;

function Avatar({ name, mine }: { name: string; mine?: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
      style={{
        background: mine ? "var(--accent-primary)" : "var(--bg-elevated)",
        color: mine ? "var(--bg-base)" : "var(--text-secondary)",
        border: mine ? "none" : "1px solid var(--hairline)",
      }}
    >
      {initials(name)}
    </span>
  );
}

export default function CommentThread({
  postId,
  comments,
}: {
  postId: string;
  comments: PostComment[];
}) {
  const { addComment, removeComment } = usePostActions();
  const [draft, setDraft] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // The store drops an empty body on the floor, but stopping here as
    // well means the textarea is not cleared by a submit that did nothing.
    if (!draft.trim()) return;
    addComment(postId, draft);
    setDraft("");
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-[var(--hairline)] pt-4">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar name={comment.author} mine={comment.mine} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                    {comment.author}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                    {commentAge(comment)}
                  </span>
                  {comment.mine && (
                    <button
                      type="button"
                      onClick={() => removeComment(postId, comment.id)}
                      className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[#f87171]"
                    >
                      Delete
                    </button>
                  )}
                </div>
                {/* `break-words` rather than `truncate`: a comment is the
                  * one thing on the card the reader wrote, and hiding the
                  * end of their own sentence behind an ellipsis to protect
                  * the layout is the wrong trade. */}
                <p className="mt-1 break-words font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor={`comment-${postId}`} className="sr-only">
          Add a comment
        </label>
        <textarea
          id={`comment-${postId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line. A comment box that
            // needs the mouse to submit is the slower of the two defaults,
            // and the multi-paragraph reply is the rarer case.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          rows={2}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--bg-elevated)] px-3 py-2.5 font-serif text-[13px] leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-secondary)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-[var(--text-secondary)]">
            {draft.length >= MAX_COMMENT_LENGTH
              ? "Character limit reached"
              : "Enter to post · Shift+Enter for a new line"}
          </span>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rail-pill glass-flat shrink-0 rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </form>
    </div>
  );
}
