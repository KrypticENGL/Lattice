/**
 * The Simulator's sample programs.
 *
 * Each one is a real C++ snippet plus a narrator that walks the same
 * algorithm in TypeScript, recording a step per statement into a
 * `TraceRecorder`. See trace-builder.ts for why the traces are built in
 * the browser and why they still come out in the backend's schema.
 *
 * They are chosen to cover the three panels between them rather than to
 * be interesting programs: one that is all heap and pointers, one that is
 * all call stack, one that is both at once, and one where two frames
 * alias the same allocation and then it gets freed underneath them.
 */

import type { StepEvent } from "@/lib/trace-schema/types";
import { lineFinder, TraceRecorder } from "./trace-builder";

export type SimulatorProgram = {
  id: string;
  /** Shown in the editor's file chip, so it looks like a filename. */
  file: string;
  name: string;
  /** One line, in the program picker — what this sample is here to show. */
  blurb: string;
  source: string;
  build: () => StepEvent[];
};

/* ------------------------------------------------------------------ */
/* 1. Linked list — heap allocation and a pointer walk                  */
/* ------------------------------------------------------------------ */

const LINKED_LIST_SOURCE = `#include <cstdio>

struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};

int main() {
    Node* head = new Node(3);
    head->next = new Node(7);
    head->next->next = new Node(1);

    int sum = 0;
    for (Node* p = head; p != nullptr; p = p->next) {
        sum += p->val;
    }

    printf("sum = %d\\n", sum);
    return 0;
}
`;

function buildLinkedList(): StepEvent[] {
  const line = lineFinder(LINKED_LIST_SOURCE);
  const t = new TraceRecorder();

  t.call("main");
  t.step(line("int main()"), { event: "call" });

  const head = t.alloc("Node", { val: 3, next: null });
  t.set("head", { ref: head });
  t.step(line("Node* head = new Node(3);"));

  const second = t.alloc("Node", { val: 7, next: null });
  t.fields(head).next = { ref: second };
  t.step(line("head->next = new Node(7);"));

  const third = t.alloc("Node", { val: 1, next: null });
  t.fields(second).next = { ref: third };
  t.step(line("head->next->next = new Node(1);"));

  t.set("sum", 0);
  t.step(line("int sum = 0;"));

  const forLine = line("for (Node* p = head;");
  const bodyLine = line("sum += p->val;");
  const walk = [head, second, third];
  let sum = 0;

  for (let i = 0; i < walk.length; i++) {
    t.set("p", { ref: walk[i] });
    t.step(forLine);
    sum += [3, 7, 1][i];
    t.set("sum", sum);
    t.step(bodyLine);
  }

  // The condition that ends the loop: `p` has walked off the end.
  t.set("p", null);
  t.step(forLine);
  t.drop("p");

  t.step(line('printf("sum = %d'), { stdout: `sum = ${sum}\n` });
  t.step(line("return 0;"), { event: "return" });

  return t.done();
}

/* ------------------------------------------------------------------ */
/* 2. Factorial — the call stack, and nothing but the call stack        */
/* ------------------------------------------------------------------ */

const FACTORIAL_SOURCE = `#include <cstdio>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    int sub = factorial(n - 1);
    return n * sub;
}

int main() {
    int n = 4;
    int result = factorial(n);
    printf("%d! = %d\\n", n, result);
    return 0;
}
`;

function buildFactorial(): StepEvent[] {
  const line = lineFinder(FACTORIAL_SOURCE);
  const t = new TraceRecorder();

  const signature = line("int factorial(int n)");
  const guard = line("if (n <= 1)");
  const base = line("return 1;");
  const recurse = line("int sub = factorial(n - 1);");
  const combine = line("return n * sub;");

  function factorial(n: number): number {
    t.call("factorial", { n });
    t.step(signature, { event: "call" });
    t.step(guard);

    if (n <= 1) {
      t.step(base, { event: "return" });
      t.ret();
      return 1;
    }

    const sub = factorial(n - 1);
    t.set("sub", sub);
    t.step(recurse);
    t.step(combine, { event: "return" });
    t.ret();
    return n * sub;
  }

  t.call("main");
  t.step(line("int main()"), { event: "call" });

  const n = 4;
  t.set("n", n);
  t.step(line("int n = 4;"));

  const result = factorial(n);
  t.set("result", result);
  t.step(line("int result = factorial(n);"));

  t.step(line('printf("%d! = %d'), { stdout: `${n}! = ${result}\n` });
  t.step(line("return 0;"), { event: "return" });

  return t.done();
}

/* ------------------------------------------------------------------ */
/* 3. Binary search tree — recursion *and* a growing heap               */
/* ------------------------------------------------------------------ */

const BST_SOURCE = `#include <cstdio>

struct TreeNode {
    int key;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int k) : key(k), left(nullptr), right(nullptr) {}
};

TreeNode* insert(TreeNode* node, int key) {
    if (node == nullptr) {
        return new TreeNode(key);
    }
    if (key < node->key) {
        node->left = insert(node->left, key);
    } else {
        node->right = insert(node->right, key);
    }
    return node;
}

int main() {
    TreeNode* root = nullptr;
    int keys[4] = {8, 3, 10, 1};
    for (int i = 0; i < 4; i++) {
        root = insert(root, keys[i]);
    }
    printf("root = %d\\n", root->key);
    return 0;
}
`;

function buildBst(): StepEvent[] {
  const line = lineFinder(BST_SOURCE);
  const t = new TraceRecorder();

  const signature = line("TreeNode* insert(TreeNode* node, int key)");
  const nullGuard = line("if (node == nullptr)");
  const allocate = line("return new TreeNode(key);");
  const compare = line("if (key < node->key)");
  const goLeft = line("node->left = insert(node->left, key);");
  const goRight = line("node->right = insert(node->right, key);");
  const returnNode = line("return node;");

  /** Mirrors `insert`, returning the address the C++ version would. */
  function insert(node: string | null, key: number): string {
    t.call("insert", { node: node ? { ref: node } : null, key });
    t.step(signature, { event: "call" });
    t.step(nullGuard);

    if (node === null) {
      const fresh = t.alloc("TreeNode", { key, left: null, right: null });
      t.step(allocate, { event: "return" });
      t.ret();
      return fresh;
    }

    t.step(compare);
    const nodeKey = t.fields(node).key as number;

    if (key < nodeKey) {
      const child = insert((t.fields(node).left as { ref: string } | null)?.ref ?? null, key);
      t.fields(node).left = { ref: child };
      t.step(goLeft);
    } else {
      const child = insert((t.fields(node).right as { ref: string } | null)?.ref ?? null, key);
      t.fields(node).right = { ref: child };
      t.step(goRight);
    }

    t.step(returnNode, { event: "return" });
    t.ret();
    return node;
  }

  t.call("main");
  t.step(line("int main()"), { event: "call" });

  t.set("root", null);
  t.step(line("TreeNode* root = nullptr;"));

  const keys = [8, 3, 10, 1];
  t.set("keys", keys);
  t.step(line("int keys[4]"));

  const loopLine = line("for (int i = 0; i < 4; i++)");
  const assignLine = line("root = insert(root, keys[i]);");
  let root: string | null = null;

  for (let i = 0; i < keys.length; i++) {
    t.set("i", i);
    t.step(loopLine);
    root = insert(root, keys[i]);
    t.set("root", { ref: root });
    t.step(assignLine);
  }

  t.set("i", keys.length);
  t.step(loopLine);
  t.drop("i");

  t.step(line('printf("root = %d'), { stdout: "root = 8\n" });
  t.step(line("return 0;"), { event: "return" });

  return t.done();
}

/* ------------------------------------------------------------------ */
/* 4. Heap array — two frames aliasing one allocation, then a free      */
/* ------------------------------------------------------------------ */

const ARRAY_SOURCE = `#include <cstdio>

void reverse(int* xs, int n) {
    int lo = 0;
    int hi = n - 1;
    while (lo < hi) {
        int t = xs[lo];
        xs[lo] = xs[hi];
        xs[hi] = t;
        lo++;
        hi--;
    }
    return;
}

int main() {
    int* xs = new int[5]{4, 8, 15, 16, 23};
    reverse(xs, 5);
    printf("%d %d\\n", xs[0], xs[4]);
    delete[] xs;
    return 0;
}
`;

function buildArray(): StepEvent[] {
  const line = lineFinder(ARRAY_SOURCE);
  const t = new TraceRecorder();

  t.call("main");
  t.step(line("int main()"), { event: "call" });

  const values = [4, 8, 15, 16, 23];
  // An `int[5]` on the heap, one field per index — the same shape the
  // backend gives a struct, so the memory card renders it unchanged.
  const xs = t.alloc(
    `int[${values.length}]`,
    Object.fromEntries(values.map((v, i) => [String(i), v])),
  );
  t.set("xs", { ref: xs });
  t.step(line("int* xs = new int[5]"));

  t.call("reverse", { xs: { ref: xs }, n: values.length });
  t.step(line("void reverse(int* xs, int n)"), { event: "call" });

  let lo = 0;
  t.set("lo", lo);
  t.step(line("int lo = 0;"));

  let hi = values.length - 1;
  t.set("hi", hi);
  t.step(line("int hi = n - 1;"));

  const whileLine = line("while (lo < hi)");
  const readLine = line("int t = xs[lo];");
  const writeLoLine = line("xs[lo] = xs[hi];");
  const writeHiLine = line("xs[hi] = t;");
  const incLine = line("lo++;");
  const decLine = line("hi--;");
  const cells = t.fields(xs);

  while (lo < hi) {
    t.step(whileLine);

    const held = cells[String(lo)];
    t.set("t", held);
    t.step(readLine);

    cells[String(lo)] = cells[String(hi)];
    t.step(writeLoLine);

    cells[String(hi)] = held;
    t.step(writeHiLine);

    lo += 1;
    t.set("lo", lo);
    t.step(incLine);

    hi -= 1;
    t.set("hi", hi);
    t.step(decLine);

    t.drop("t");
  }

  t.step(whileLine);
  t.step(line("return;"), { event: "return" });
  t.ret();
  t.step(line("reverse(xs, 5);"));

  const first = cells["0"] as number;
  const last = cells[String(values.length - 1)] as number;
  t.step(line('printf("%d %d'), { stdout: `${first} ${last}\n` });

  // The allocation goes; `xs` keeps the address. That dangling pointer is
  // the reason this sample is here — the memory panel draws it as one.
  t.free(xs);
  t.step(line("delete[] xs;"));
  t.step(line("return 0;"), { event: "return" });

  return t.done();
}

/* ------------------------------------------------------------------ */

export const SIMULATOR_PROGRAMS: SimulatorProgram[] = [
  {
    id: "linked-list",
    file: "linked_list.cpp",
    name: "Linked list",
    blurb: "Allocate three nodes, then walk the chain",
    source: LINKED_LIST_SOURCE,
    build: buildLinkedList,
  },
  {
    id: "factorial",
    file: "factorial.cpp",
    name: "Recursive factorial",
    blurb: "Four frames deep, then unwinding",
    source: FACTORIAL_SOURCE,
    build: buildFactorial,
  },
  {
    id: "bst",
    file: "bst_insert.cpp",
    name: "Binary search tree",
    blurb: "Recursion growing a heap structure",
    source: BST_SOURCE,
    build: buildBst,
  },
  {
    id: "heap-array",
    file: "reverse_array.cpp",
    name: "Heap array + dangling pointer",
    blurb: "Two frames on one allocation, then delete[]",
    source: ARRAY_SOURCE,
    build: buildArray,
  },
];

export const DEFAULT_PROGRAM_ID = SIMULATOR_PROGRAMS[0].id;

export function programById(id: string): SimulatorProgram {
  return SIMULATOR_PROGRAMS.find((p) => p.id === id) ?? SIMULATOR_PROGRAMS[0];
}
