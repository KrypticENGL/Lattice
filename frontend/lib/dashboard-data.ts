// Deterministic pseudo-random helper — same output on server and client
// render, so it's safe to use for mock data without hydration mismatches.
function seeded(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export type ActivityDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

const WEEKS = 18;

export function getActivityWeeks(): ActivityDay[][] {
  const today = new Date("2026-08-07");
  const totalDays = WEEKS * 7;
  const days: ActivityDay[] = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const roll = seeded(i + 1);
    const count = roll > 0.62 ? Math.floor(seeded(i + 500) * 9) + 1 : 0;
    const level: ActivityDay["level"] =
      count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 6 ? 3 : 4;
    days.push({
      date: date.toISOString().slice(0, 10),
      count,
      level,
    });
  }

  const weeks: ActivityDay[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }
  return weeks;
}

export type Canvas = {
  id: string;
  name: string;
  language: "Python" | "JavaScript";
  structure: string;
  nodes: number;
  editedAt: string;
  accent: string;
};

export const CANVASES: Canvas[] = [
  {
    id: "c1",
    name: "LRU cache eviction",
    language: "Python",
    structure: "Doubly linked list + hash map",
    nodes: 9,
    editedAt: "2 hours ago",
    accent: "var(--accent-primary)",
  },
  {
    id: "c2",
    name: "BST balancing pass",
    language: "JavaScript",
    structure: "Binary search tree",
    nodes: 15,
    editedAt: "Yesterday",
    accent: "var(--accent-secondary)",
  },
  {
    id: "c3",
    name: "Dijkstra shortest path",
    language: "Python",
    structure: "Weighted graph",
    nodes: 12,
    editedAt: "3 days ago",
    accent: "#60a5fa",
  },
  {
    id: "c4",
    name: "Ring buffer producer/consumer",
    language: "JavaScript",
    structure: "Circular buffer",
    nodes: 6,
    editedAt: "1 week ago",
    accent: "#34d399",
  },
];

export const STATS = [
  { label: "Canvases created", value: "12", delta: "+3 this week" },
  { label: "Traces run", value: "184", delta: "+27 this week" },
  { label: "Day streak", value: "6", delta: "Personal best: 11" },
];
