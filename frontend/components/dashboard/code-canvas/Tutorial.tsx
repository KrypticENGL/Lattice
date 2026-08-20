"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const TUTORIAL_STORAGE_KEY = "lattice:code-canvas:tutorial:v1";

type Placement = "center" | "left" | "right" | "top" | "bottom";

type Step = {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value of the element to spotlight; omitted = a centred
   * card with no cut-out. */
  target?: string;
  placement: Placement;
  /** Optional keyboard/mouse hint rendered as a mono footnote. */
  hint?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Build the structure, get the code",
    body: "Code-Canvas is the Visualizer in reverse. Drag out blocks for the data structure you have in mind, wire them together, and Lattice writes the real, runnable code for whatever you built.",
    placement: "center",
    hint: "Takes about a minute · Esc to skip",
  },
  {
    id: "palette",
    title: "Every block lives here",
    body: "Structures are the pieces (list cells, tree nodes, vertices), containers hold values, and operations do something with them. Drag a block onto the canvas, or just click it to drop one in the middle.",
    target: "palette",
    placement: "right",
  },
  {
    id: "canvas",
    title: "The canvas is yours",
    body: "Drag a block to move it. Drag empty space to pan, scroll to zoom. Nothing snaps to a grid — lay the structure out the way you actually picture it.",
    target: "canvas",
    placement: "center",
  },
  {
    id: "handles",
    title: "Connect with the handles",
    body: "Filled dots on a block's edge are outgoing handles. Press one and drag to another block to wire them up — you can let go anywhere on the target and the wire snaps to its nearest handle. A list cell's next takes one connection; a vertex's edges handle takes as many as you want.",
    target: "canvas",
    placement: "center",
    hint: "Click a wire to select it, then click the ✕ to cut it",
  },
  {
    id: "start",
    title: "Start with a start pointer",
    body: "A Start pointer names the structure — head, root, whatever you like — and points at its first block. It's what the generated code walks from, and what operations act on.",
    target: "palette",
    placement: "right",
  },
  {
    id: "operations",
    title: "Operations run in order",
    body: "Wire a structure into an operation's top handle to say what it acts on. Chain operations left to right through their then handles, and that becomes the order the statements run in.",
    target: "palette",
    placement: "right",
  },
  {
    id: "code",
    title: "The code follows along",
    body: "Every edit rewrites this pane immediately — it's generated from the graph, so it's read-only here. If part of your graph can't be expressed in code yet, it shows up as a note at the bottom instead of failing silently.",
    target: "code-pane",
    placement: "left",
  },
  {
    id: "handoff",
    title: "Send it to the Visualizer",
    body: "Visualize opens this code in a fresh Visualizer canvas, where it actually runs in the sandbox and you can step through the trace of what your structure does.",
    target: "handoff",
    placement: "left",
  },
  {
    id: "help",
    title: "That's the whole thing",
    body: "The ? button down here replays this tour whenever you want it. Go build something.",
    target: "help",
    placement: "right",
  },
];

const CARD_WIDTH = 348;
const GAP = 18;
const PAD = 10;

type Box = { top: number; left: number; width: number; height: number };

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Places the card beside the spotlight, then clamps it into the viewport —
 * so a target near an edge (the palette at the bottom-left, the help button
 * in the corner) never pushes the card off-screen. */
function cardPosition(box: Box | null, placement: Placement, cardHeight: number) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const margin = 16;

  if (!box || placement === "center") {
    return { left: (vw - CARD_WIDTH) / 2, top: Math.max(margin, (vh - cardHeight) / 2) };
  }

  let left: number;
  let top: number;
  switch (placement) {
    case "right":
      left = box.left + box.width + GAP;
      top = box.top + box.height / 2 - cardHeight / 2;
      break;
    case "left":
      left = box.left - CARD_WIDTH - GAP;
      top = box.top + box.height / 2 - cardHeight / 2;
      break;
    case "top":
      left = box.left + box.width / 2 - CARD_WIDTH / 2;
      top = box.top - cardHeight - GAP;
      break;
    default:
      left = box.left + box.width / 2 - CARD_WIDTH / 2;
      top = box.top + box.height + GAP;
  }

  return {
    left: Math.min(Math.max(margin, left), vw - CARD_WIDTH - margin),
    top: Math.min(Math.max(margin, top), Math.max(margin, vh - cardHeight - margin)),
  };
}

/**
 * First-run guide for Code-Canvas.
 *
 * The overlay never blocks the app: the dimming is `pointer-events: none`,
 * so you can drag a block out while the step describing it is still on
 * screen. Skipping is always one click (or Esc) away, and finishing or
 * skipping both mark it seen — the tour is opt-in from the ? button after
 * that.
 *
 * Remounted (via a changing `key`) each time it's reopened, which is what
 * rewinds it to step one — no reset effect needed.
 */
export default function Tutorial({
  open,
  onClose,
}: {
  open: boolean;
  /** `completed` is true only when the last step was reached via Done. */
  onClose: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(240);

  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const isLast = index === STEPS.length - 1;

  // Re-measured every frame rather than on resize alone: the sidebar
  // expands on hover, the palette collapses, the code pane resizes — all
  // without a resize event — and the spotlight has to follow all of it.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const measure = () => {
      const selector = step.target ? `[data-tour="${step.target}"]` : null;
      const element = selector ? document.querySelector<HTMLElement>(selector) : null;
      const rect = element?.getBoundingClientRect() ?? null;
      const next = rect
        ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
        : null;
      setBox((prev) => (sameBox(prev, next) ? prev : next));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [open, step.target]);

  const finish = useCallback((completed: boolean) => onClose(completed), [onClose]);

  const next = useCallback(() => {
    if (isLast) finish(true);
    else setIndex((i) => i + 1);
  }, [finish, isLast]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, finish, next, open]);

  const position = useMemo(
    () => cardPosition(box, step.placement, cardHeight),
    [box, cardHeight, step.placement],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tutorial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed inset-0 z-50"
        >
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <mask id="lattice-tour-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {box && (
                  <motion.rect
                    initial={false}
                    animate={{ x: box.left, y: box.top, width: box.width, height: box.height }}
                    transition={{ type: "spring", stiffness: 320, damping: 34 }}
                    rx={18}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(4, 7, 11, 0.66)"
              mask="url(#lattice-tour-mask)"
            />
            {box && (
              <motion.rect
                initial={false}
                animate={{ x: box.left, y: box.top, width: box.width, height: box.height }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                rx={18}
                fill="none"
                stroke="var(--accent-primary)"
                strokeWidth={1.5}
                opacity={0.9}
              />
            )}
          </svg>

          <motion.div
            className="pointer-events-auto absolute"
            initial={false}
            animate={{ left: position.left, top: position.top }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{ width: CARD_WIDTH }}
          >
            <div
              ref={(el) => {
                if (el) {
                  const height = el.getBoundingClientRect().height;
                  setCardHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
                }
              }}
              className="matte rounded-2xl p-5"
              style={{ boxShadow: "0 30px 60px -24px rgba(0,0,0,0.9)" }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-secondary)]">
                  Step {index + 1} of {STEPS.length}
                </span>
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Skip tutorial
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <h2 className="font-serif text-[19px] font-bold leading-snug text-[var(--text-primary)]">
                    {step.title}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{step.body}</p>
                  {step.hint && (
                    <p className="mt-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]/80">
                      {step.hint}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`Go to step ${i + 1}`}
                      onClick={() => setIndex(i)}
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: i === index ? 16 : 6,
                        background: i === index ? "var(--accent-primary)" : "var(--hairline-strong)",
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={back}
                      className="rounded-full border border-[var(--hairline)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text-primary)]"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-shadow hover:shadow-[0_0_16px_var(--accent-glow)]"
                    style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
                  >
                    {isLast ? "Done" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
