/**
 * The community feed — `/api/posts`, stored in MongoDB.
 *
 * Unlike canvases, posts are public: the feed is everybody's. What the
 * caller's token decides is what they may *change* — their own reactions,
 * their own comments, their own posts — and every one of those checks is
 * the server's, never this file's.
 *
 * Each mutation answers with the whole post as it now stands, rather than
 * with a bare 204. That is what lets the store replace one entry and be
 * exactly in step with the database, instead of applying an optimistic
 * guess and hoping it matched.
 */

import { apiRequest, jsonBody } from "@/lib/api";
import type { CanvasAttachment, Post } from "./types";

export function fetchPosts(token: string | null) {
  return apiRequest<Post[]>("/api/posts", token);
}

export function fetchSavedPosts(token: string | null) {
  return apiRequest<Post[]>("/api/posts/saved", token);
}

export function fetchPost(id: string, token: string | null) {
  return apiRequest<Post>(`/api/posts/${encodeURIComponent(id)}`, token);
}

export type NewPost = {
  title: string;
  body: string[];
  tags?: string[];
  accent?: string;
  /** At least one. The server rejects a post with nothing attached — a
   * trace nobody can look at is a blog entry, and this feed is for the
   * drawings. */
  canvases: CanvasAttachment[];
};

/** The author name and handle are deliberately absent: the server takes
 * them from the verified token, so a post can't be published under
 * somebody else's name. */
export function publishPost(post: NewPost, token: string | null) {
  return apiRequest<Post>("/api/posts", token, jsonBody("POST", post));
}

export function deletePost(id: string, token: string | null) {
  return apiRequest<void>(`/api/posts/${encodeURIComponent(id)}`, token, { method: "DELETE" });
}

export function setLiked(id: string, on: boolean, token: string | null) {
  return apiRequest<Post>(
    `/api/posts/${encodeURIComponent(id)}/like`,
    token,
    jsonBody("POST", { on }),
  );
}

export function setSaved(id: string, on: boolean, token: string | null) {
  return apiRequest<Post>(
    `/api/posts/${encodeURIComponent(id)}/save`,
    token,
    jsonBody("POST", { on }),
  );
}

export function addComment(id: string, body: string, token: string | null) {
  return apiRequest<Post>(
    `/api/posts/${encodeURIComponent(id)}/comments`,
    token,
    jsonBody("POST", { body }),
  );
}

export function deleteComment(id: string, commentId: string, token: string | null) {
  return apiRequest<Post>(
    `/api/posts/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
    token,
    { method: "DELETE" },
  );
}
