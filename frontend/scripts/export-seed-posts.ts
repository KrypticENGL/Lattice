/**
 * Exports the feed's seed posts to `backend/seed/posts.json`.
 *
 * The posts are authored in `lib/posts/data.ts` because that is where the
 * `Diagram` and `CanvasGraph` types they are built from live — hand-tuning
 * a diagram's node coordinates is a frontend job. The backend needs them
 * as data, though, so this converts the TypeScript into the exact document
 * shape `crate::posts::Post` deserializes and writes it out.
 *
 * Run with `npm run seed:posts` after editing data.ts. The JSON is only
 * ever read once, on a backend boot that finds an empty feed.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { POSTS } from "../lib/posts/data";

/** Turns a hand-written label like "2 days ago" into a real instant.
 *
 * The seeds carry relative labels because they were rendered directly;
 * stored posts carry timestamps, so the feed can sort them and age them
 * on its own. Anything unrecognised falls back to "now", which is wrong by
 * at most a few days and never breaks the sort. */
function toInstant(label: string): string {
  const match = /^(\d+)\s+(minute|hour|day|week|month)s?\s+ago$/.exec(label.trim());
  const now = Date.now();
  if (!match) return new Date(now).toISOString();
  const amount = Number(match[1]);
  const ms: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
  };
  return new Date(now - amount * ms[match[2]]).toISOString();
}

const documents = POSTS.map((post) => {
  const publishedAt = toInstant(post.publishedAt);
  return {
    id: post.id,
    // Seeded posts belong to nobody, which is what makes them
    // undeletable: every ownership check is `owner_id == caller`.
    owner_id: null,
    title: post.title,
    body: post.body,
    author: post.author,
    handle: post.handle,
    published_at: publishedAt,
    read_time: post.readTime,
    tags: post.tags,
    accent: post.accent,
    canvas: post.canvas,
    // Likes are a set of user ids now, so a seeded count becomes that many
    // placeholder ids. They belong to nobody real, which is the point: a
    // signed-in reader's own like is added alongside them and can be taken
    // back without ever dropping below what the seed claimed.
    liked_by: Array.from({ length: post.likes }, (_, i) => `seed:${post.id}:${i}`),
    saved_by: [],
    comments: post.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      author_id: null,
      body: comment.body,
      created_at: comment.at ? toInstant(comment.at) : publishedAt,
    })),
    created_at: publishedAt,
    updated_at: publishedAt,
  };
});

const out = resolve(import.meta.dirname, "../../backend/seed/posts.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(documents, null, 2)}\n`);
console.log(`wrote ${documents.length} seed posts to ${out}`);
