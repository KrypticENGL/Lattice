"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/* The card's box, declared rather than measured: its position is worked
   out before it exists, and its height is fixed so that moving between
   two pills is a translation and nothing has to resize mid-flight. Both
   are applied to the card directly, so this *is* the box, not a guess
   about one. Long enough for the wordiest role line below. */
const CARD_WIDTH = 260;
const CARD_HEIGHT = 156;
/** Space between the pill and the card that opens beside it. */
const GAP = 10;
/** Margin the card keeps from the edges of the scroll frame. */
const EDGE = 12;

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  nextjs: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8v8M8.5 8l7 8M15.5 8v3.5" />
    </svg>
  ),
  react: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </svg>
  ),
  typescript: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7 8.5h5M9.5 8.5V16" />
      <path d="M14 15.3c.3.8 1.1 1.2 2 1 .9-.2 1.4-1.1.6-1.7-.8-.6-2.4-.6-2.6-1.6-.2-1 .8-1.6 1.8-1.4.7.1 1.1.5 1.3 1" />
    </svg>
  ),
  tailwind: (
    <svg {...ICON_PROPS}>
      <path d="M4 9.5c1.4-3 3.4-3 5-1.5 1.6 1.5 3 1.5 4.4 0 1.6-1.5 3.6-1.5 5 1.5" />
      <path d="M4 15c1.4-3 3.4-3 5-1.5 1.6 1.5 3 1.5 4.4 0 1.6-1.5 3.6-1.5 5 1.5" />
    </svg>
  ),
  monaco: (
    <svg {...ICON_PROPS}>
      <path d="M9 6.5l-5 5.5 5 5.5M15 6.5l5 5.5-5 5.5" />
    </svg>
  ),
  reactflow: (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="7" r="2.1" />
      <circle cx="18" cy="7" r="2.1" />
      <circle cx="12" cy="18" r="2.1" />
      <path d="M7.7 8.6L10.5 16M16.3 8.6L13.5 16" />
    </svg>
  ),
  d3: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M12 7v4M12 11l-5 5M12 11l5 5" />
    </svg>
  ),
  framer: (
    <svg {...ICON_PROPS}>
      <path d="M6 4h12v5.5H12" />
      <path d="M6 9.5h6v5.5" />
      <path d="M6 15h6l6 6H12v-6z" />
    </svg>
  ),
  rust: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.2" strokeDasharray="1.4 2.2" />
    </svg>
  ),
  tokio: (
    <svg {...ICON_PROPS}>
      <path d="M5 12a7 7 0 0 1 12-4.9" />
      <path d="M17 4.5v3.4h-3.4" />
      <path d="M19 12a7 7 0 0 1-12 4.9" />
      <path d="M7 19.5v-3.4h3.4" />
    </svg>
  ),
  axum: (
    <svg {...ICON_PROPS}>
      <path d="M4 20V11a8 8 0 0 1 16 0v9" />
      <path d="M4 20h16" />
    </svg>
  ),
  serde: (
    <svg {...ICON_PROPS}>
      <path d="M9.5 4.5c-2 0-2.8 1-2.8 2.7v2.4c0 1.1-.6 1.9-1.9 1.9 1.3 0 1.9.8 1.9 1.9v2.4c0 1.7.8 2.7 2.8 2.7" />
      <path d="M14.5 4.5c2 0 2.8 1 2.8 2.7v2.4c0 1.1.6 1.9 1.9 1.9-1.3 0-1.9.8-1.9 1.9v2.4c0 1.7-.8 2.7-2.8 2.7" />
    </svg>
  ),
  bollard: (
    <svg {...ICON_PROPS}>
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8M4 8l8 4 8-4" />
    </svg>
  ),
  tracing: (
    <svg {...ICON_PROPS}>
      <path d="M2.5 13c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0" />
    </svg>
  ),
  docker: (
    <svg {...ICON_PROPS}>
      <path d="M3 13h18c0 3.5-3.1 6.5-9 6.5S3 16.5 3 13z" />
      <rect x="5.2" y="9.2" width="3" height="3" />
      <rect x="9.2" y="9.2" width="3" height="3" />
      <rect x="13.2" y="9.2" width="3" height="3" />
      <rect x="9.2" y="5.2" width="3" height="3" />
    </svg>
  ),
  gvisor: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5l6.5 2.7v5.3c0 4.4-2.7 7.1-6.5 8-3.8-.9-6.5-3.6-6.5-8V6.2L12 3.5z" />
    </svg>
  ),
  redis: (
    <svg {...ICON_PROPS}>
      <path d="M12 4.5l7.5 3-7.5 3-7.5-3 7.5-3z" />
      <path d="M4.5 11.5l7.5 3 7.5-3" />
      <path d="M4.5 15.5l7.5 3 7.5-3" />
    </svg>
  ),
  postgres: (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="6.5" rx="6.8" ry="2.4" />
      <path d="M5.2 6.5v11c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4v-11" />
      <path d="M5.2 12c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4" />
    </svg>
  ),
  python: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.2c-3.2 0-4.3 1-4.3 3.3v2.2h4.3" />
      <path d="M7.7 8.7H4.9c-1.6 0-2.2 1.1-2.2 2.8s.6 2.8 2.2 2.8h3.4" />
      <circle cx="9.1" cy="5.6" r=".55" fill="currentColor" stroke="none" />
      <path d="M12 20.8c3.2 0 4.3-1 4.3-3.3v-2.2h-4.3" />
      <path d="M16.3 15.3h2.8c1.6 0 2.2-1.1 2.2-2.8s-.6-2.8-2.2-2.8h-3.4" />
      <circle cx="14.9" cy="18.4" r=".55" fill="currentColor" stroke="none" />
    </svg>
  ),
  babel: (
    <svg {...ICON_PROPS}>
      <path d="M3.5 8.5h9M12.5 8.5l-3-3M12.5 8.5l-3 3" />
      <path d="M20.5 15.5h-9M11.5 15.5l3-3M11.5 15.5l3 3" />
    </svg>
  ),
};

type StackItem = { name: string; icon: keyof typeof ICONS; role: string };

/* The `role` lines say what each piece does *here*, not what it is in
   general — a reader who already knows what Postgres is learns nothing
   from being told it is a database. They follow BLUEPRINT.md §2, which
   records the reason each choice was made. */
const STACK: { group: string; items: StackItem[] }[] = [
  {
    group: "Frontend",
    items: [
      {
        name: "Next.js 16",
        icon: "nextjs",
        role: "App Router shell. Server-renders the editor and workstation so the first paint is instant, then hands the interactive panels to client components.",
      },
      {
        name: "React 19",
        icon: "react",
        role: "The layer the visualizer is built on. Every trace step is just new props, so a replay is a re-render rather than bespoke drawing code.",
      },
      {
        name: "TypeScript",
        icon: "typescript",
        role: "The trace schema is typed end to end. Change the format and the build breaks — instead of the diagram quietly going wrong.",
      },
      {
        name: "Tailwind CSS v4",
        icon: "tailwind",
        role: "Every surface here, including the glass material on these pills and the one-section-per-screen scrolling this page uses.",
      },
      {
        name: "Monaco Editor",
        icon: "monaco",
        role: "The editor VS Code is built on, driving the snippet pane — syntax highlighting and per-language modes for free.",
      },
      {
        name: "React Flow",
        icon: "reactflow",
        role: "Draws node-link structures — linked lists, graphs, trees — and underpins the Code-Canvas node builder.",
      },
      {
        name: "d3-hierarchy",
        icon: "d3",
        role: "Computes tree layout, so a binary tree lands where a reader expects it rather than where the trace happened to emit it.",
      },
      {
        name: "Framer Motion",
        icon: "framer",
        role: "Diffs one trace step against the next, so a pointer re-targeting glides to its new node instead of teleporting.",
      },
    ],
  },
  {
    group: "Backend",
    items: [
      {
        name: "Rust",
        icon: "rust",
        role: "The trace pipeline: it accepts a snippet, drives the sandbox that runs it, and streams the resulting steps back.",
      },
      {
        name: "Tokio",
        icon: "tokio",
        role: "The async runtime. One task per run, so a snippet that sits in an infinite loop never blocks anyone else's trace.",
      },
      {
        name: "Axum 0.8",
        icon: "axum",
        role: "HTTP routes and the WebSocket the trace streams over — steps reach the browser as they are produced, not in one lump at the end.",
      },
      {
        name: "serde / serde_json",
        icon: "serde",
        role: "Serializes the canonical trace schema — the single contract between a tracer and the frontend, and what makes new languages cheap to add.",
      },
      {
        name: "bollard",
        icon: "bollard",
        role: "Speaks the Docker Engine API from async Rust, so the backend can start, watch and kill sandbox containers without shelling out.",
      },
      {
        name: "tracing",
        icon: "tracing",
        role: "Structured logs across the pipeline, so a run that failed can be followed from the request all the way to the container exiting.",
      },
    ],
  },
  {
    group: "Sandbox & infra",
    items: [
      {
        name: "Docker",
        icon: "docker",
        role: "Every run gets a throwaway container built from this repo's tracer image, and it is destroyed once the trace is captured.",
      },
      {
        name: "gVisor (runsc)",
        icon: "gvisor",
        role: "The isolation layer the sandbox is designed to sit on: a syscall interception boundary between untrusted code and the host kernel.",
      },
      {
        name: "Redis",
        icon: "redis",
        role: "Where the run queue goes once traces outgrow a single instance. Today they are scheduled in-process, which is enough at this size.",
      },
      {
        name: "Postgres (sqlx)",
        icon: "postgres",
        role: "Saved canvases and trace runs, plus the posts, comments and notifications behind the community layer. Queried with compile-time-checked SQL.",
      },
    ],
  },
  {
    group: "Tracers",
    items: [
      {
        name: "Python sys.settrace",
        icon: "python",
        role: "A line-level hook the interpreter calls as it executes, recording each assignment and mutation in the order it really happened.",
      },
      {
        name: "Babel / SWC",
        icon: "babel",
        role: "Instruments JavaScript at the AST level, so a JS run emits the same trace events as every other language the visualizer already reads.",
      },
    ],
  },
];

/** An open card: which technology, and where it sits in the grid. */
type Active = {
  item: StackItem;
  /** Offsets from the grid's top-left, applied as a transform. */
  x: number;
  y: number;
  side: "right" | "left";
};

/**
 * A pill. Purely presentational — it reports hover upward and owns no
 * card of its own.
 *
 * The card used to live here, one per pill, which meant moving the
 * pointer from one pill to the next unmounted one card and mounted
 * another: two unrelated animations that read as a flicker rather than
 * as a single thing moving. There is now one card for the whole
 * section (see `Technologies`), so switching pills is a move.
 */
function Pill({
  item,
  onShow,
  onHide,
}: {
  item: StackItem;
  onShow: (item: StackItem, el: HTMLElement) => void;
  onHide: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  function show() {
    // Hover-expansion is a pointer affordance. On a touch screen the tap
    // that opens a card is also the tap that would leave it stuck open.
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (ref.current) onShow(item, ref.current);
  }

  return (
    <li
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={onHide}
      onFocus={show}
      onBlur={onHide}
      tabIndex={0}
      className="glass-flat relative flex items-center gap-2.5 rounded-full px-3 py-1 text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent-secondary)]"
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: "var(--accent-secondary)" }}
      >
        {ICONS[item.icon]}
      </span>
      <span className="font-mono text-[12px]">{item.name}</span>
    </li>
  );
}

export default function Technologies() {
  const [active, setActive] = useState<Active | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  function show(item: StackItem, el: HTMLElement) {
    if (closeTimer.current) clearTimeout(closeTimer.current);

    const grid = gridRef.current;
    const frame = grid?.closest(".snap-container");
    if (!grid || !frame) return;

    // One measurement per hover, before anything animates.
    const origin = grid.getBoundingClientRect();
    const pill = el.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();

    // Beside the pill on the right, unless the frame runs out first —
    // which is what happens to the last column.
    const side =
      bounds.right - pill.right >= CARD_WIDTH + GAP + EDGE ? "right" : "left";
    const x =
      side === "right"
        ? pill.right - origin.left + GAP
        : pill.left - origin.left - GAP - CARD_WIDTH;

    // Centred on its pill, then nudged back inside if that would hang
    // the card over the top or bottom of the frame.
    let top = pill.top + pill.height / 2 - CARD_HEIGHT / 2;
    if (top < bounds.top + EDGE) top = bounds.top + EDGE;
    else if (top + CARD_HEIGHT > bounds.bottom - EDGE) {
      top = bounds.bottom - EDGE - CARD_HEIGHT;
    }

    setActive({ item, x: Math.round(x), y: Math.round(top - origin.top), side });
  }

  /**
   * Closing is deferred. Leaving one pill fires before entering the
   * next, so clearing immediately would tear the card down and rebuild
   * it — exactly the flicker this is meant to remove. A short grace
   * period lets the next pill (or the card itself) cancel the close,
   * and it also covers the pointer crossing the gap between them.
   */
  function hide() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActive(null), 90);
  }

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <section
      id="technologies"
      className="flex min-h-full flex-col justify-center py-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Technologies
          </span>
          <h2 className="text-balance mt-2.5 font-serif text-3xl leading-[1.05] font-black tracking-tight text-[var(--text-primary)] wide:text-4xl">
            The stack underneath.
          </h2>
          <p className="mt-4 max-w-xl font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
            A real interpreter, a locked-down sandbox, and a language-agnostic
            trace schema — the stack that makes &ldquo;trace first, visualize
            second&rdquo; possible.
          </p>
        </motion.div>

        <div
          ref={gridRef}
          className="relative mt-6 grid gap-5 sm:mt-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4"
        >
          {STACK.map((group, i) => (
            <motion.div
              key={group.group}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              // The stagger runs while the panel is still gliding into
              // place, so a long tail reads as the content lagging behind
              // the scroll rather than as choreography. Four columns land
              // within 0.55s of the first instead of 0.69s.
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <h3 className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--text-secondary)] uppercase">
                {group.group}
              </h3>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <Pill
                    key={item.name}
                    item={item}
                    onShow={show}
                    onHide={hide}
                  />
                ))}
              </ul>
            </motion.div>
          ))}

          <AnimatePresence>
            {active && (
              <motion.div
                // A constant key, deliberately: React keeps this one node
                // across a change of pill, so moving between pills
                // animates `x`/`y` on an element that never went away.
                // Keying it by technology would unmount and remount it,
                // which is the flicker being fixed.
                key="tech-card"
                initial={{
                  opacity: 0,
                  scale: reduceMotion ? 1 : 0.94,
                  x: active.x,
                  y: active.y,
                }}
                animate={{ opacity: 1, scale: 1, x: active.x, y: active.y }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : {
                        // The travel is the slow part and carries the eye;
                        // opacity and scale only have to cover the card
                        // arriving and leaving.
                        x: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                        y: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                        default: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                      }
                }
                style={
                  {
                    width: CARD_WIDTH,
                    // Fixed, so travelling between two pills is a pure
                    // translation. A card that also resized would have to
                    // animate its box, which is layout work the
                    // compositor cannot do on its own.
                    height: CARD_HEIGHT,
                    top: 0,
                    left: 0,
                    transformOrigin:
                      active.side === "right" ? "left center" : "right center",
                  } satisfies CSSProperties
                }
                // Transparent to the pointer, and it has to be: the card
                // opens over the neighbouring column, so a card that took
                // hover events would sit between the cursor and the very
                // pills it is meant to describe — you could not reach the
                // next column while one was open. Nothing in here is
                // interactive, so it gives up the pointer entirely.
                className="tech-card pointer-events-none absolute z-30 overflow-hidden rounded-2xl"
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    // The contents cross-fade per technology, so the text
                    // changes without the card flickering underneath it.
                    key={active.item.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.08 : 0.18 }}
                    className="absolute inset-0 flex flex-col justify-center p-3.5"
                  >
                    {/* The mark, blown up and bled off the trailing edge
                        as a watermark. Decorative, so it is hidden from
                        assistive tech and never takes the pointer. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute flex h-[118px] w-[118px] items-center justify-center"
                      style={{
                        color: "var(--accent-secondary)",
                        opacity: 0.09,
                        right: -20,
                        bottom: -18,
                      }}
                    >
                      {ICONS[active.item.icon]}
                    </span>

                    <div className="relative flex items-center gap-2.5">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        style={{ color: "var(--accent-secondary)" }}
                      >
                        {ICONS[active.item.icon]}
                      </span>
                      <span className="font-mono text-[12.5px] font-medium text-[var(--text-primary)]">
                        {active.item.name}
                      </span>
                    </div>
                    <p className="relative mt-2.5 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
                      {active.item.role}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
