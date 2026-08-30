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

export type TraceRun = {
  id: string;
  structure: string;
  snippet: string;
  steps: number;
  ranAt: string;
  accent: string;
};

export const RECENT_TRACES: TraceRun[] = [
  {
    id: "t1",
    structure: "LinkedList<int>",
    snippet: "head.next.next = Node(1)",
    steps: 9,
    ranAt: "18m ago",
    accent: "var(--accent-secondary)",
  },
  {
    id: "t2",
    structure: "TreeNode",
    snippet: "root.left.right = TreeNode(12)",
    steps: 13,
    ranAt: "1h ago",
    accent: "var(--accent-primary)",
  },
  {
    id: "t3",
    structure: "Graph<string>",
    snippet: "graph.addEdge('a', 'c')",
    steps: 7,
    ranAt: "4h ago",
    accent: "#c2703d",
  },
  {
    id: "t4",
    structure: "RingBuffer<int>",
    snippet: "buffer.push(42)",
    steps: 5,
    ranAt: "Yesterday",
    accent: "#b5651d",
  },
  {
    id: "t5",
    structure: "HashMap<string, int>",
    snippet: "counts['a'] = counts.get('a', 0) + 1",
    steps: 4,
    ranAt: "Yesterday",
    accent: "#e8993d",
  },
  {
    id: "t6",
    structure: "Stack<int>",
    snippet: "stack.pop()",
    steps: 3,
    ranAt: "2 days ago",
    accent: "var(--accent-secondary)",
  },
  {
    id: "t7",
    structure: "BinaryHeap<int>",
    snippet: "heap.siftDown(0)",
    steps: 11,
    ranAt: "3 days ago",
    accent: "var(--accent-primary)",
  },
  {
    id: "t8",
    structure: "Trie",
    snippet: "node.children['e'] = TrieNode()",
    steps: 8,
    ranAt: "4 days ago",
    accent: "#c2703d",
  },
  {
    id: "t9",
    structure: "DoublyLinkedList<int>",
    snippet: "node.prev.next = node.next",
    steps: 6,
    ranAt: "5 days ago",
    accent: "#b5651d",
  },
];

export const STATS = [
  { label: "Canvases created", value: "12", delta: "+3 this week" },
  { label: "Traces run", value: "184", delta: "+27 this week" },
  { label: "Day streak", value: "6", delta: "Personal best: 11" },
];

export type NotificationItem = {
  id: string;
  type: "reply" | "comment";
  author: string;
  postTitle: string;
  excerpt: string;
  time: string;
};

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    type: "reply",
    author: "Priya N.",
    postTitle: "Debugging cyclic references in a linked list",
    excerpt: "This finally clicked once I saw the pointer swap step-by-step — thank you!",
    time: "12m ago",
  },
  {
    id: "n2",
    type: "comment",
    author: "Marcus O.",
    postTitle: "Why does my BST rotation break the invariant?",
    excerpt: "Have you checked whether the parent pointer gets updated after the rotation?",
    time: "1h ago",
  },
  {
    id: "n3",
    type: "reply",
    author: "Elena V.",
    postTitle: "Visualizing Dijkstra without a priority queue",
    excerpt: "Same trace, but with a plain array — helped me understand the O(V^2) case.",
    time: "3h ago",
  },
  {
    id: "n4",
    type: "comment",
    author: "Sam K.",
    postTitle: "LRU cache eviction, step by step",
    excerpt: "Could you post the trace for evicting the tail node too?",
    time: "Yesterday",
  },
  {
    id: "n5",
    type: "reply",
    author: "Diego R.",
    postTitle: "Ring buffer wrap-around explained",
    excerpt: "This is the clearest explanation of modulo indexing I've seen.",
    time: "2 days ago",
  },
];
