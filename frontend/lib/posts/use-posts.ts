"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import * as api from "./api";
import type { Post, PostComment } from "./types";
import { relativeTime } from "@/lib/relative-time";

/**
 * The feed, fetched once and shared by every component that renders it.
 *
 * A module-level store rather than component state or a context, for the
 * reason it has always been one: `/dashboard/posts`, `/dashboard/saved`
 * and `/dashboard/posts/{id}` are separate routes, and a like made on one
 * has to be visible on the others immediately. Lifting it to a context
 * would still lose everything on navigation.
 *
 * What changed is where the truth is. Reactions and comments used to live
 * in this browser's `localStorage`, which meant a like was a private note
 * to yourself. They are the server's now, so a post's like count is the
 * real one and a comment is visible to everybody. This store is a cache of
 * that, refreshed from the response every mutation returns.
 *
 * `useSyncExternalStore` for the same reason as before: the snapshot has
 * to be stable across renders, and the server render has no data yet.
 */

type Snapshot = {
  posts: Post[];
  loading: boolean;
  error: string | null;
};

/** Stable identity for the pre-load state — a `getSnapshot` that returns a
 * fresh object every call is an infinite re-render loop. */
const EMPTY: Snapshot = { posts: [], loading: true, error: null };

let snapshot: Snapshot = EMPTY;
let loadStarted = false;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

/** The server render and the first client render must agree, and the
 * server has fetched nothing. */
function getServerSnapshot() {
  return EMPTY;
}

/** Replaces one post in place, keeping feed order. Every mutation answers
 * with the post as it now stands, so this never has to merge or guess. */
function replace(updated: Post) {
  publish({
    ...snapshot,
    posts: snapshot.posts.map((p) => (p.id === updated.id ? updated : p)),
  });
}

/**
 * The feed. Loads on the first mount that asks for it and is shared from
 * then on; `reload` forces a refetch, which is what a mutation failure
 * falls back to rather than leaving the cache guessing.
 */
export function usePosts(): Snapshot & { reload: () => Promise<void> } {
  const { getToken, isLoaded } = useAuth();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const load = useCallback(async () => {
    try {
      const posts = await api.fetchPosts(await getToken());
      publish({ posts, loading: false, error: null });
    } catch (err) {
      publish({
        posts: snapshot.posts,
        loading: false,
        error: err instanceof Error ? err.message : "Couldn't load the feed.",
      });
    }
  }, [getToken]);

  useEffect(() => {
    // `getToken()` before Clerk has loaded returns null, and the request
    // would come back 401.
    if (!isLoaded || loadStarted) return;
    loadStarted = true;
    load();
  }, [isLoaded, load]);

  return { ...state, reload: load };
}

/** Everything on one post that the store knows about. Kept as a shape
 * rather than reading the fields off `post` directly because the callers
 * were written against it, and because `likeCount` reads better than
 * `likes` beside a `liked` boolean. */
export type PostView = {
  post: Post;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  comments: PostComment[];
};

export function usePostView(post: Post): PostView {
  // The post passed in may be a stale copy held by a parent that rendered
  // before the last mutation landed, so the store's own entry wins.
  const { posts } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const current = posts.find((p) => p.id === post.id) ?? post;
    return {
      post: current,
      liked: current.liked,
      saved: current.saved,
      likeCount: current.likes,
      comments: current.comments,
    };
  }, [post, posts]);
}

/** The ids this reader has saved. Kept as the same `{ saved }` shape the
 * feed's count pill already reads. */
export function usePostState(): { saved: string[] } {
  const { posts } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => ({ saved: posts.filter((p) => p.saved).map((p) => p.id) }), [posts]);
}

/** The saved feed. Posts that no longer exist simply aren't in the store,
 * so a deleted post can't leave a gap here. */
export function useSavedPosts(): Post[] {
  const { posts } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => posts.filter((p) => p.saved), [posts]);
}

/**
 * The mutations, each one a request whose response replaces the cached
 * post.
 *
 * No optimistic update: these are single round trips to a database that
 * answers with the new truth, and the flicker saved by guessing isn't
 * worth a like that shows as applied and silently wasn't.
 */
export function usePostActions() {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      // Toggles rather than setters: the store already holds the current
      // value, so making every caller read it first and pass it back would
      // be a race between two tabs waiting to happen.
      async toggleLike(postId: string) {
        const on = !snapshot.posts.find((p) => p.id === postId)?.liked;
        replace(await api.setLiked(postId, on, await getToken()));
      },
      async toggleSave(postId: string) {
        const on = !snapshot.posts.find((p) => p.id === postId)?.saved;
        replace(await api.setSaved(postId, on, await getToken()));
      },
      async addComment(postId: string, body: string) {
        replace(await api.addComment(postId, body, await getToken()));
      },
      async removeComment(postId: string, commentId: string) {
        replace(await api.deleteComment(postId, commentId, await getToken()));
      },
      async publish(post: api.NewPost) {
        const created = await api.publishPost(post, await getToken());
        publish({ ...snapshot, posts: [created, ...snapshot.posts] });
        return created;
      },
      async remove(postId: string) {
        await api.deletePost(postId, await getToken());
        publish({ ...snapshot, posts: snapshot.posts.filter((p) => p.id !== postId) });
      },
    }),
    [getToken],
  );
}

/** A relative label for a comment. */
export function commentAge(comment: PostComment): string {
  return relativeTime(comment.createdAt);
}

/** A stable initials badge for an author, so the feed can show an avatar
 * without shipping images.
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
