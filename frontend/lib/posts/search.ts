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
    // Every attachment's name and step, so a post is findable by any of
    // the canvases on it rather than only by whichever one is first.
    ...post.canvases.map((canvas) => canvas.name),
    ...post.canvases.map((canvas) => canvas.stepLabel),
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

/** How the feed is ordered. */
export type SortOrder = "latest" | "top";

/**
 * Posts carrying every tag in `tags`.
 *
 * ANDed, like the search terms above, and for the same reason: picking a
 * second tag should narrow what you are looking at, not widen it. An
 * empty set is not a filter and returns the array unchanged.
 */
export function filterByTags(posts: Post[], tags: ReadonlySet<string>): Post[] {
  if (tags.size === 0) return posts;
  return posts.filter((post) => {
    const has = new Set(post.tags);
    for (const tag of tags) if (!has.has(tag)) return false;
    return true;
  });
}

/** Every tag in the feed with how many posts carry it, commonest first
 * and alphabetical within a count so the rail does not reshuffle itself
 * between renders. */
export function tagCounts(posts: Post[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * The feed in the reader's chosen order.
 *
 * "latest" is the authored order, which is already newest-first; sorting
 * it again by a date these posts do not carry would be inventing one.
 *
 * "top" ranks by `post.likes` — everybody else's likes — and deliberately
 * not by the count the card shows, which includes the reader's own. The
 * difference only ever amounts to one, and it is the difference between a
 * feed that holds still and a feed that reorders itself under your cursor
 * the moment you like something in it.
 */
export function sortPosts(posts: Post[], order: SortOrder): Post[] {
  if (order === "latest") return posts;
  return posts
    .map((post, i) => ({ post, i }))
    .sort((a, b) => b.post.likes - a.post.likes || a.i - b.i)
    .map(({ post }) => post);
}
