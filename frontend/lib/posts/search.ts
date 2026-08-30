/**
 * Free-text search over the feed.
 *
 * Lives beside `data.ts` rather than inside `PostFeed` because it is the
 * half of the feature that has nothing to do with React: given the posts
 * and what the reader typed, which posts survive. When these posts come
 * from a server the query goes with the request instead and this module
 * is what gets deleted — not the component around it.
 */

import type { Post } from "./types";

/** Everything about a post a reader could plausibly be typing at.
 *
 * The body is included on purpose. These are write-ups, and the phrase
 * somebody remembers ("wrap-around", "fast pointer") is far more often a
 * sentence out of the prose than it is a title or a tag — searching only
 * the metadata would answer "no posts" for a post that plainly contains
 * the words. */
function haystack(post: Post): string {
  return [
    post.title,
    ...post.body,
    post.author,
    post.handle,
    ...post.tags,
    post.canvas.name,
    post.canvas.stepLabel,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Posts matching `query`, in the order they were given.
 *
 * Terms are ANDed and matched as substrings: "list bug" finds a post
 * about a linked-list bug regardless of how far apart the two words sit,
 * and "poin" still finds "pointers" while somebody is mid-word. An empty
 * or whitespace-only query is not a filter at all — it returns the array
 * unchanged, so the unsearched feed costs nothing.
 */
export function searchPosts(posts: Post[], query: string): Post[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return posts;
  return posts.filter((post) => {
    const text = haystack(post);
    return terms.every((term) => text.includes(term));
  });
}
