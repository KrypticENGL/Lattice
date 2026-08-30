"use client";

import { useMemo, useSyncExternalStore } from "react";
import { POSTS } from "./data";
import type { Post, PostComment } from "./types";

/**
 * What this browser has done to the feed: liked, saved, commented.
 *
 * Browser storage rather than a server, because there is no posts API yet
 * (see data.ts). The important part is that it is *one* store rather than
 * component state: /dashboard/posts and /dashboard/saved are separate
 * routes, and a bookmark made on one has to be visible on the other
 * immediately and after a reload. Local state in a feed component could
 * not do that, and lifting it to a context would still lose everything on
 * navigation.
 *
 * Same `useSyncExternalStore` shape as `use-edge-style.ts`, for the same
 * two reasons: storage does not exist on the server, so the snapshot has
 * to start empty and reconcile after hydration, and this project's lint
 * forbids the read-storage-in-an-effect that would otherwise do it.
 */

const STORAGE_KEY = "lattice:posts";

export type PostState = {
  /** Post ids, most recently saved first — the saved page reads this
   * order directly rather than re-sorting by a date it does not have. */
  saved: string[];
  liked: string[];
  /** Reader-written comments, by post id. Seeded comments live in the
   * post itself and are never copied in here; the two are concatenated at
   * read time so editing the seed data can never orphan a reply. */
  comments: Record<string, PostComment[]>;
};

/** Stable identity, so an unhydrated render and a storage-less browser
 * both return the *same* object rather than a fresh empty one each call —
 * a `getSnapshot` that returns a new reference every time is an infinite
 * re-render loop. */
const EMPTY: PostState = { saved: [], liked: [], comments: {} };

let cached: PostState | null = null;
let nextCommentId = 0;
const listeners = new Set<() => void>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Parses whatever is in storage into a shape the rest of the module can
 * trust. Anything unrecognised degrades to the empty default for that one
 * field rather than throwing: this is a convenience store, and a reader
 * whose likes are unreadable should still get a working page. */
function parse(raw: string | null): PostState {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<PostState> | null;
    if (!data || typeof data !== "object") return EMPTY;
    const comments: Record<string, PostComment[]> = {};
    if (data.comments && typeof data.comments === "object") {
      for (const [postId, list] of Object.entries(data.comments)) {
        if (Array.isArray(list)) comments[postId] = list as PostComment[];
      }
    }
    return {
      saved: isStringArray(data.saved) ? data.saved : [],
      liked: isStringArray(data.liked) ? data.liked : [],
      comments,
    };
  } catch {
    return EMPTY;
  }
}

function readStored(): PostState {
  if (cached !== null) return cached;
  try {
    cached = parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode, or storage disabled. Caching the default stops every
    // render from retrying a call that is going to keep throwing.
    cached = EMPTY;
  }
  return cached;
}

function write(next: PostState) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not being able to persist is no reason to refuse the interaction —
    // `cached` has already made it take effect for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    cached = null;
    for (const listener of listeners) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
}

export function usePostState(): PostState {
  return useSyncExternalStore(subscribe, readStored, () => EMPTY);
}

/**
 * The like / save / comment actions.
 *
 * Grouped behind a `useMemo` purely so call sites get a stable identity
 * and can list them in dependency arrays without a lint fight — these
 * close over nothing, so the memo is about identity, not cost.
 */
export function usePostActions() {
  return useMemo(
    () => ({
      toggleLike(postId: string) {
        const state = readStored();
        write({ ...state, liked: toggle(state.liked, postId) });
      },

      toggleSave(postId: string) {
        const state = readStored();
        write({ ...state, saved: toggle(state.saved, postId) });
      },

      addComment(postId: string, body: string) {
        const text = body.trim();
        if (!text) return;
        const state = readStored();
        const comment: PostComment = {
          // Not `crypto.randomUUID`: it is unavailable over plain http on
          // some browsers, which `next dev` is. The timestamp keeps ids
          // unique across sessions and the counter within one.
          id: `c-${Date.now().toString(36)}-${(nextCommentId += 1).toString(36)}`,
          author: "You",
          body: text,
          createdAt: Date.now(),
          mine: true,
        };
        write({
          ...state,
          comments: {
            ...state.comments,
            [postId]: [...(state.comments[postId] ?? []), comment],
          },
        });
      },

      removeComment(postId: string, commentId: string) {
        const state = readStored();
        const list = state.comments[postId];
        if (!list) return;
        write({
          ...state,
          comments: {
            ...state.comments,
            [postId]: list.filter((c) => c.id !== commentId),
          },
        });
      },
    }),
    [],
  );
}

/** Everything on one post that the store knows about, folded together
 * with the post's own seeded numbers. */
export type PostView = {
  post: Post;
  liked: boolean;
  saved: boolean;
  /** Seeded likes plus this reader's, so un-liking can never take the
   * total below what other people contributed. */
  likeCount: number;
  /** Seeded comments first, then this reader's, oldest to newest. */
  comments: PostComment[];
};

export function usePostView(post: Post): PostView {
  const state = usePostState();
  return useMemo(() => {
    const liked = state.liked.includes(post.id);
    return {
      post,
      liked,
      saved: state.saved.includes(post.id),
      likeCount: post.likes + (liked ? 1 : 0),
      comments: [...post.comments, ...(state.comments[post.id] ?? [])],
    };
  }, [post, state]);
}

/** The saved feed, in the order things were saved. Ids that no longer
 * match a post are dropped rather than rendered as a gap — seed data can
 * change underneath a bookmark, and a server-backed feed will be able to
 * delete posts outright. */
export function useSavedPosts(): Post[] {
  const state = usePostState();
  return useMemo(
    () =>
      state.saved
        .map((id) => POSTS.find((p) => p.id === id))
        .filter((p): p is Post => p !== undefined),
    [state],
  );
}

/** A relative label for a comment: the seeded one if it has one, otherwise
 * derived from its timestamp. */
export function commentAge(comment: PostComment): string {
  if (comment.at) return comment.at;
  if (comment.createdAt === undefined) return "";

  const seconds = Math.max(0, Math.round((Date.now() - comment.createdAt) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** A stable initials badge for an author, so the feed can show an avatar
 * without shipping images for people who do not exist yet.
 *
 * A one-word name gets one letter, not its first two: the reader's own
 * comments are signed "You", and "YO" reads as a word rather than as
 * initials. Two words give the usual first-and-last pair. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
