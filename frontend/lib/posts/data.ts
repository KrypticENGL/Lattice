/**
 * The community feed's seed posts.
 *
 * Front-end only, deliberately: there is no `posts` table and no
 * `/api/posts` behind this yet (the backend's migrations stop at
 * canvases). The page is built against this module the way the
 * Simulator is built against `lib/simulator/programs.ts` — real shapes,
 * canned source — so that wiring a server underneath it later replaces
 * one import and touches no component.
 *
 * Every post carries a `Diagram` rather than an image URL. That is the
 * same structure `buildDiagram` produces from a real trace, so
 * `CanvasPreview` renders these through the same geometry the Visualizer
 * uses and a future server post can hand over a genuine traced diagram
 * without the card knowing the difference.
 */

import type { Diagram } from "@/lib/shape-detection";
import { POST_GRAPHS } from "./graphs";
import type { Post } from "./types";

/** Nodes evenly spaced along a row, the way `buildDiagram` lays a list
 * out (`NODE_SPACING_X` there is 110). Authoring these by hand is what
 * keeps the seed diagrams looking like traced ones rather than like
 * something drawn freehand. */
function row(labels: string[], y = 0) {
  return labels.map((label, i) => ({
    id: `n${i}`,
    x: i * 110,
    y,
    label,
    type: "Node",
  }));
}

/** Nodes placed evenly around a circle, matching the graph layout's ring
 * (`GRAPH_RADIUS` 130). Starts at the top and runs clockwise so the first
 * node is where a reader's eye lands. */
function ring(labels: string[], radius = 130) {
  return labels.map((label, i) => {
    const angle = (i / labels.length) * Math.PI * 2 - Math.PI / 2;
    return {
      id: `n${i}`,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      label,
      type: "Node",
    };
  });
}

function chain(count: number, field: string) {
  return Array.from({ length: count - 1 }, (_, i) => ({
    from: `n${i}`,
    to: `n${i + 1}`,
    field,
  }));
}

/**
 * Drawn as a rho rather than a row: a tail running into a loop.
 *
 * The obvious layout — all five nodes on one line, plus an edge from the
 * last back to the middle — puts the back-edge exactly on top of the
 * forward ones, because collinear nodes give a router no room to route
 * around. It comes out as a line with an arrowhead at each end, which
 * reads as two nodes pointing at each other rather than as a cycle. The
 * loop needs its own space to be visible at all.
 */
const CYCLIC_LIST: Diagram = {
  kind: "linked-list",
  nodes: [
    { id: "n0", x: 0, y: 0, label: "3", type: "Node" },
    { id: "n1", x: 110, y: 0, label: "9", type: "Node" },
    { id: "n2", x: 220, y: 0, label: "14", type: "Node" },
    { id: "n3", x: 310, y: 95, label: "27", type: "Node" },
    { id: "n4", x: 200, y: 135, label: "41", type: "Node" },
  ],
  edges: [
    ...chain(5, "next"),
    // The bug the post is about: the tail points back into the middle
    // instead of at null, so a walk never terminates.
    { from: "n4", to: "n2", field: "next" },
  ],
  roots: ["n0"],
};

const BST_ROTATION: Diagram = {
  kind: "tree",
  nodes: [
    { id: "n0", x: 0, y: 0, label: "30", type: "TreeNode" },
    { id: "n1", x: -90, y: 100, label: "20", type: "TreeNode" },
    { id: "n2", x: 90, y: 100, label: "45", type: "TreeNode" },
    { id: "n3", x: -135, y: 200, label: "10", type: "TreeNode" },
    { id: "n4", x: -45, y: 200, label: "25", type: "TreeNode" },
    { id: "n5", x: 45, y: 200, label: "40", type: "TreeNode" },
    { id: "n6", x: 135, y: 200, label: "60", type: "TreeNode" },
  ],
  edges: [
    { from: "n0", to: "n1", field: "left" },
    { from: "n0", to: "n2", field: "right" },
    { from: "n1", to: "n3", field: "left" },
    { from: "n1", to: "n4", field: "right" },
    { from: "n2", to: "n5", field: "left" },
    { from: "n2", to: "n6", field: "right" },
  ],
  roots: ["n0"],
};

const WEIGHTED_GRAPH: Diagram = {
  kind: "graph",
  nodes: ring(["a", "b", "c", "d", "e", "f"]),
  edges: [
    { from: "n0", to: "n1", field: "4" },
    { from: "n0", to: "n5", field: "8" },
    { from: "n1", to: "n2", field: "11" },
    { from: "n2", to: "n3", field: "7" },
    { from: "n3", to: "n4", field: "9" },
    { from: "n4", to: "n5", field: "10" },
    { from: "n1", to: "n4", field: "2" },
    { from: "n2", to: "n5", field: "6" },
  ],
  roots: ["n0"],
};

const RING_BUFFER: Diagram = {
  kind: "graph",
  nodes: ring(["0", "1", "2", "3", "4", "5"], 120),
  edges: [
    ...chain(6, "next"),
    // The wrap. Drawn like every other edge on purpose: the whole point
    // of the post is that index 5 -> 0 is not a special case.
    { from: "n5", to: "n0", field: "next" },
  ],
  roots: ["n0"],
};

/**
 * The `next` chain only, though the structure is doubly linked.
 *
 * A `prev` edge is the exact reverse of the `next` edge beside it, and
 * every routing here joins circle centres — so the two land on top of one
 * another and come out as a single line with an arrowhead at both ends.
 * Curved routing happens to bow them apart, straight and right-angle do
 * not, and a preview that only reads correctly under one of the reader's
 * three settings is worse than one that shows less.
 */
const LRU_LIST: Diagram = {
  kind: "linked-list",
  nodes: row(["k4", "k7", "k1", "k9"]),
  edges: chain(4, "next"),
  roots: ["n0"],
};

const TRIE: Diagram = {
  kind: "tree",
  nodes: [
    { id: "n0", x: 0, y: 0, label: "·", type: "TrieNode" },
    { id: "n1", x: -70, y: 100, label: "c", type: "TrieNode" },
    { id: "n2", x: 70, y: 100, label: "t", type: "TrieNode" },
    { id: "n3", x: -70, y: 200, label: "a", type: "TrieNode" },
    { id: "n4", x: 20, y: 200, label: "o", type: "TrieNode" },
    { id: "n5", x: 120, y: 200, label: "r", type: "TrieNode" },
    { id: "n6", x: -70, y: 300, label: "t", type: "TrieNode" },
    { id: "n7", x: 120, y: 300, label: "y", type: "TrieNode" },
  ],
  edges: [
    { from: "n0", to: "n1", field: "c" },
    { from: "n0", to: "n2", field: "t" },
    { from: "n1", to: "n3", field: "a" },
    { from: "n2", to: "n4", field: "o" },
    { from: "n2", to: "n5", field: "r" },
    { from: "n3", to: "n6", field: "t" },
    { from: "n5", to: "n7", field: "y" },
  ],
  roots: ["n0"],
};

export const POSTS: Post[] = [
  {
    id: "p1",
    title: "Debugging cyclic references in a linked list",
    body: [
      "I lost the better part of an afternoon to a list that would not finish printing. No crash, no exception, just a loop that never came back — and a tail node that pointed at the middle of its own list instead of at null.",
      "Floyd's cycle detection is usually filed under interview trivia, but it is genuinely the cheapest instrument you have here: two pointers, no allocation, and it tells you a cycle exists before you have worked out where. Once the trace is on a canvas the where becomes obvious anyway, which is the part I want to show.",
      "The canvas below is the step right after the bad assignment lands. Node 41's next has been pointed back at 14, and you can see the walk close on itself rather than running off the end.",
    ],
    author: "Priya N.",
    handle: "@priyan",
    publishedAt: "2 days ago",
    readTime: "6 min read",
    tags: ["linked-list", "debugging", "pointers"],
    accent: "var(--accent-secondary)",
    canvas: {
      canvasId: "c-cyclic-list",
      name: "LinkedList<int> — cycle",
      language: "cpp",
      stepLabel: "Step 14 of 22",
      diagram: CYCLIC_LIST,
      graph: POST_GRAPHS.p1,
    },
    likes: 128,
    comments: [
      {
        id: "p1c1",
        author: "Marcus O.",
        body: "The pointer swap finally clicked once I stepped it rather than read it. Thanks for posting the canvas and not just the code.",
        at: "1 day ago",
      },
      {
        id: "p1c2",
        author: "Sam K.",
        body: "Worth adding that the tortoise and hare meet inside the cycle, not at its entrance — finding the entrance needs the second walk from the head.",
        at: "22 hours ago",
      },
    ],
  },
  {
    id: "p2",
    title: "Why does my BST rotation break the invariant?",
    body: [
      "Every rotation write-up draws the same three-node picture, and every one of them quietly assumes the subtree you are rotating is the root. It usually is not, and the parent pointer is the part that gets forgotten.",
      "A left rotation moves three links, not two. If you only reassign the child pointers you end up with a perfectly well-formed subtree that nothing points at any more, and the tree above it still believes the old node is in charge.",
      "Here is the tree at the step before the rotation, with 30 still at the root. Step forward once on the canvas and watch which of the three edges does not get rewritten.",
    ],
    author: "Marcus O.",
    handle: "@marcuso",
    publishedAt: "4 days ago",
    readTime: "4 min read",
    tags: ["tree", "bst", "invariants"],
    accent: "#c2703d",
    canvas: {
      canvasId: "c-bst-rotate",
      name: "TreeNode — left rotation",
      language: "cpp",
      stepLabel: "Step 8 of 19",
      diagram: BST_ROTATION,
      graph: POST_GRAPHS.p2,
    },
    likes: 94,
    comments: [
      {
        id: "p2c1",
        author: "Elena V.",
        body: "This is the diagram I needed three years ago. The parent link being invisible in most drawings is exactly why it gets dropped.",
        at: "3 days ago",
      },
    ],
  },
  {
    id: "p3",
    title: "Visualizing Dijkstra without a priority queue",
    body: [
      "Reaching for a binary heap before you can see the algorithm is how Dijkstra ends up memorised instead of understood. The O(V^2) version — scan the array, take the smallest unvisited node — does exactly the same thing and has nothing in it to hide behind.",
      "Traced on a six-node graph it fits on one screen, and the relaxation step stops looking like bookkeeping: you can watch a tentative distance get overwritten the moment a cheaper path shows up.",
      "Swap the scan for a heap afterwards and the only thing that changes is how you find the minimum. That is a much easier thing to believe once you have seen the slow one run.",
    ],
    author: "Elena V.",
    handle: "@elenav",
    publishedAt: "1 week ago",
    readTime: "8 min read",
    tags: ["graph", "dijkstra", "shortest-path"],
    accent: "#e8993d",
    canvas: {
      canvasId: "c-dijkstra",
      name: "Graph<string> — relaxation",
      language: "cpp",
      stepLabel: "Step 31 of 64",
      diagram: WEIGHTED_GRAPH,
      graph: POST_GRAPHS.p3,
    },
    likes: 212,
    comments: [
      {
        id: "p3c1",
        author: "Diego R.",
        body: "Ran the same trace with a heap side by side and the step counts tell the story better than the big-O does.",
        at: "5 days ago",
      },
      {
        id: "p3c2",
        author: "Priya N.",
        body: "The edge weights being on the wires rather than in a table is doing a lot of work here.",
        at: "4 days ago",
      },
    ],
  },
  {
    id: "p4",
    title: "Ring buffer wrap-around explained",
    body: [
      "Modulo indexing is one of those things that reads as arithmetic and behaves as geometry. Written as (head + 1) % capacity it looks like a special case bolted onto the end of the array. Drawn as a ring, there is no end for it to be bolted onto.",
      "That is the whole trick, and it is why the canvas below is laid out as a circle rather than a row: index 5 pointing at index 0 is the same edge as every other one on the diagram.",
      "Once the wrap stops being a special case, the full and empty conditions stop being confusing too — they are the only two states where head and tail agree.",
    ],
    author: "Diego R.",
    handle: "@diegor",
    publishedAt: "2 weeks ago",
    readTime: "5 min read",
    tags: ["ring-buffer", "arrays", "modulo"],
    accent: "var(--accent-primary)",
    canvas: {
      canvasId: "c-ring-buffer",
      name: "RingBuffer<int> — wrap",
      language: "cpp",
      stepLabel: "Step 12 of 12",
      diagram: RING_BUFFER,
      graph: POST_GRAPHS.p4,
    },
    likes: 76,
    comments: [],
  },
  {
    id: "p5",
    title: "LRU cache eviction, step by step",
    body: [
      "An LRU cache is two data structures pretending to be one, and almost every bug in one comes from the two disagreeing. The map finds a node in constant time; the doubly linked list is what makes moving that node to the front constant too.",
      "Eviction is the step worth tracing. You drop the tail, and you have to remember to erase its key from the map as well — miss that and the map keeps growing forever while the list stays exactly at capacity, which is a leak that looks like correct behaviour from the outside.",
      "The canvas shows the recency order the list encodes: head is the most recently touched key, tail is the one about to go. Every get is a splice out and a re-insert at the front, which is the whole reason this is a list and not an array.",
    ],
    author: "Sam K.",
    handle: "@samk",
    publishedAt: "3 weeks ago",
    readTime: "7 min read",
    tags: ["lru", "linked-list", "caching"],
    accent: "#b5651d",
    canvas: {
      canvasId: "c-lru-cache",
      name: "LRUCache — evict tail",
      language: "cpp",
      stepLabel: "Step 27 of 40",
      diagram: LRU_LIST,
      graph: POST_GRAPHS.p5,
    },
    likes: 143,
    comments: [
      {
        id: "p5c1",
        author: "Marcus O.",
        body: "Could you post the trace for evicting the tail node too? The splice is the part I keep getting wrong.",
        at: "2 weeks ago",
      },
    ],
  },
  {
    id: "p6",
    title: "A trie is just a tree that spells",
    body: [
      "The word trie makes it sound like a distinct structure. It is a tree whose edges are labelled with characters, and once you draw it that way the prefix property stops needing an explanation — shared prefixes are shared paths, and that is the entire idea.",
      "Insertion is a walk that creates nodes when it runs out of them. Lookup is the same walk without the creating. The only thing worth being careful about is the terminal flag, because a node existing does not mean a word ends there.",
      "Traced below with cat, cot and try inserted, so you can see cat and cot share a node and try does not share anything.",
    ],
    author: "Priya N.",
    handle: "@priyan",
    publishedAt: "1 month ago",
    readTime: "5 min read",
    tags: ["trie", "tree", "strings"],
    accent: "var(--accent-secondary)",
    canvas: {
      canvasId: "c-trie",
      name: "Trie — insert",
      language: "cpp",
      stepLabel: "Step 18 of 26",
      diagram: TRIE,
      graph: POST_GRAPHS.p6,
    },
    likes: 58,
    comments: [],
  },
];

export function postById(id: string): Post | undefined {
  return POSTS.find((p) => p.id === id);
}
