/**
 * How long ago something happened, in words.
 *
 * One implementation for canvases, posts and comments — they had grown
 * three, which disagreed about the boundaries ("2d ago" vs "2 days ago"
 * vs "Yesterday") in a UI where a post and its comments sit inches apart.
 */

/** Formats an ISO-8601 instant relative to now. Anything older than a
 * month gets an actual date: "7w ago" is harder to read than the day it
 * happened. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  // Clamped at zero: a clock a few seconds behind the server shouldn't
  // render a post as arriving in the future.
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}
