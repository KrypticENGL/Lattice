/**
 * Who wrote a post, and what they have to show for it.
 *
 * Same standing as `data.ts`: front-end only, real shapes, canned
 * content. A post carries its author's *name* and *handle* inline
 * because a feed card needs nothing else, but a post's own page shows
 * the person behind it — the badges they have earned, the longest run
 * of days they kept going, how many traces they have run in total — and
 * none of that belongs on every card in a list. So it lives here,
 * keyed by handle, and is looked up only on the page that shows it.
 *
 * Handles are the key rather than names: two people can be "Sam K.",
 * and the handle is the thing that is already unique on every card.
 */

export type BadgeIconName =
  | "flame"
  | "cycle"
  | "tree"
  | "path"
  | "blocks"
  | "bug"
  | "pen"
  | "mentor";

export type Badge = {
  id: string;
  label: string;
  /** What the holder did to get it. Shown under the label rather than
   * hidden in a tooltip — a badge whose meaning you have to hover to
   * discover is decoration, not a credential. */
  description: string;
  icon: BadgeIconName;
  accent: string;
};

/**
 * Every badge that exists, by id.
 *
 * A catalogue rather than badges written out inside each profile: a
 * badge means the same thing whoever is wearing it, and two authors who
 * both earned "Cycle hunter" describing it differently is the bug that
 * shape prevents.
 */
export const BADGES: Record<string, Badge> = {
  "first-trace": {
    id: "first-trace",
    label: "First trace",
    description: "Ran a trace and stepped through it",
    icon: "flame",
    accent: "var(--accent-secondary)",
  },
  "cycle-hunter": {
    id: "cycle-hunter",
    label: "Cycle hunter",
    description: "Traced a structure that pointed back at itself",
    icon: "cycle",
    accent: "#e8993d",
  },
  "tree-surgeon": {
    id: "tree-surgeon",
    label: "Tree surgeon",
    description: "Repaired an invariant a rotation broke",
    icon: "tree",
    accent: "#c2703d",
  },
  pathfinder: {
    id: "pathfinder",
    label: "Pathfinder",
    description: "Traced a shortest path end to end",
    icon: "path",
    accent: "var(--accent-primary)",
  },
  "canvas-architect": {
    id: "canvas-architect",
    label: "Canvas architect",
    description: "Built a working canvas out of blocks",
    icon: "blocks",
    accent: "#b5651d",
  },
  "off-by-one": {
    id: "off-by-one",
    label: "Off by one",
    description: "Found the boundary that was one short",
    icon: "bug",
    accent: "#c2703d",
  },
  explainer: {
    id: "explainer",
    label: "Explainer",
    description: "Wrote posts other people saved",
    icon: "pen",
    accent: "var(--accent-secondary)",
  },
  mentor: {
    id: "mentor",
    label: "Mentor",
    description: "Answered questions on someone else's trace",
    icon: "mentor",
    accent: "#e8993d",
  },
  "streak-7": {
    id: "streak-7",
    label: "Seven days",
    description: "Traced something every day for a week",
    icon: "flame",
    accent: "var(--accent-primary)",
  },
  "streak-30": {
    id: "streak-30",
    label: "Thirty days",
    description: "A month of days without missing one",
    icon: "flame",
    accent: "var(--accent-secondary)",
  },
};

export type AuthorProfile = {
  handle: string;
  name: string;
  /** One line, in their own voice. */
  bio: string;
  joined: string;
  /** Badge ids into `BADGES`, in the order they were earned. */
  badges: string[];
  /** Days. The *longest* run, not the current one — a profile is a
   * record of what someone has done, and a current streak that resets
   * to zero the first day they take off is a worse thing to show a
   * visitor than the best week they ever had. */
  longestStreak: number;
  /** Traces run, all time. */
  traceRuns: number;
};

const AUTHORS: Record<string, AuthorProfile> = {
  "@priyan": {
    handle: "@priyan",
    name: "Priya N.",
    bio: "Pointer chaser. If it has a `next`, I have drawn it.",
    joined: "Joined March 2025",
    badges: ["first-trace", "cycle-hunter", "explainer", "streak-30", "mentor"],
    longestStreak: 31,
    traceRuns: 1284,
  },
  "@marcuso": {
    handle: "@marcuso",
    name: "Marcus O.",
    bio: "Balancing trees badly, then watching the replay.",
    joined: "Joined May 2025",
    badges: ["first-trace", "tree-surgeon", "streak-7"],
    longestStreak: 12,
    traceRuns: 486,
  },
  "@elenav": {
    handle: "@elenav",
    name: "Elena V.",
    bio: "Graphs, mostly. Occasionally a graph pretending to be a grid.",
    joined: "Joined January 2025",
    badges: ["first-trace", "pathfinder", "explainer", "streak-30"],
    longestStreak: 44,
    traceRuns: 2140,
  },
  "@diegor": {
    handle: "@diegor",
    name: "Diego R.",
    bio: "I write the modulo wrong first, every single time.",
    joined: "Joined August 2025",
    badges: ["first-trace", "off-by-one"],
    longestStreak: 9,
    traceRuns: 317,
  },
  "@samk": {
    handle: "@samk",
    name: "Sam K.",
    bio: "Caches, queues, and anything with an eviction policy.",
    joined: "Joined April 2025",
    badges: ["first-trace", "canvas-architect", "mentor", "streak-7"],
    longestStreak: 18,
    traceRuns: 902,
  },
};

/** The profile behind a post's byline, or `null` for an author nobody has
 * a profile for. Null rather than an invented empty profile on purpose:
 * a page can leave the badges out, but "0 traces run" under someone's
 * name is a claim about them, and it would be a false one. */
export function getAuthorProfile(handle: string): AuthorProfile | null {
  return AUTHORS[handle] ?? null;
}

/** The badges a profile holds, resolved and in earned order. Ids with no
 * catalogue entry are dropped rather than rendered as a blank pill. */
export function badgesOf(profile: AuthorProfile): Badge[] {
  return profile.badges.map((id) => BADGES[id]).filter((badge): badge is Badge => !!badge);
}
