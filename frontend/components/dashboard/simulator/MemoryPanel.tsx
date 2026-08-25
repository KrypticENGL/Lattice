"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Frame, HeapObject, TraceValue } from "@/lib/trace-schema/types";
import {
  heapColor,
  isRef,
  KIND_COLOR,
  scalarText,
  shortAddress,
  valueKind,
} from "@/lib/simulator/values";
import Panel, { PanelEmpty } from "./Panel";
import { PointerPill } from "./VariablesPanel";

/** Where an arrow starts or ends, in the panel's own coordinates. */
type Anchor = { x: number; y: number };
type Wire = { key: string; from: Anchor; to: Anchor; color: string; dangling: boolean };

/**
 * The memory diagram: pointers on the left, the heap on the right, and a
 * drawn line for every one that leads somewhere.
 *
 * The arrows are measured, not laid out. Cards wrap into however many
 * columns the panel is wide enough for and grow with their field lists, so
 * there is no arithmetic that could predict where a port ends up — the
 * ports register their own DOM nodes and this measures them after paint.
 * That is also what makes the wires survive a scroll, a window resize and
 * a step that adds a field, all of which just move a rect.
 */
export default function MemoryPanel({
  frames,
  heap,
  hoveredRef,
  onHoverRef,
}: {
  frames: Frame[];
  heap: Record<string, HeapObject>;
  hoveredRef: string | null;
  onHoverRef: (address: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  /** Bumped by anything that can move a rect without changing the trace. */
  const [measureTick, setMeasureTick] = useState(0);

  const addresses = useMemo(() => Object.keys(heap), [heap]);

  // Every pointer held by a stack frame, drawn as a pill in the left lane.
  // The other half — pointers living in a heap object's own field — are
  // read straight off `heap` in the measuring effect, since they are drawn
  // from a port on the card that owns them rather than from a lane.
  const stackPointers = useMemo(() => {
    const found: { key: string; frame: string; depth: number; name: string; address: string }[] = [];
    frames.forEach((frame, depth) => {
      for (const name of Object.keys(frame.locals)) {
        const value = frame.locals[name];
        if (isRef(value)) {
          found.push({
            key: `stack:${depth}:${name}`,
            frame: frame.function,
            depth,
            name,
            address: value.ref,
          });
        }
      }
    });
    return found;
  }, [frames]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const origin = container.getBoundingClientRect();

    /** A port's right edge / a card's left edge, relative to the panel and
     * corrected for however far the panel has been scrolled.
     *
     * Anchors are found by `data-anchor` rather than registered through
     * callback refs: a ref map would have to be written during commit and
     * read here, and the DOM already holds exactly that mapping. One query
     * per wire, once per step, against a subtree of a few dozen nodes. */
    const pointOf = (key: string, side: "right" | "left"): Anchor | null => {
      const node = container.querySelector<HTMLElement>(`[data-anchor="${key}"]`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: (side === "right" ? rect.right : rect.left) - origin.left + container.scrollLeft,
        y: rect.top + rect.height / 2 - origin.top + container.scrollTop,
      };
    };

    const next: Wire[] = [];

    const push = (fromKey: string, address: string, color: string) => {
      const from = pointOf(fromKey, "right");
      if (!from) return;
      const dangling = !(address in heap);
      const to = dangling ? { x: from.x + 26, y: from.y } : pointOf(`card:${address}`, "left");
      if (!to) return;
      next.push({ key: `${fromKey}->${address}`, from, to, color, dangling });
    };

    for (const pointer of stackPointers) {
      push(pointer.key, pointer.address, "var(--text-secondary)");
    }

    addresses.forEach((address, index) => {
      const object = heap[address];
      for (const field of Object.keys(object.fields)) {
        const value = object.fields[field];
        if (isRef(value)) push(`port:${address}:${field}`, value.ref, heapColor(index));
      }
    });

    setWires((previous) => (sameWires(previous, next) ? previous : next));
    // `frames`/`heap` are fresh objects each step, which is exactly the
    // signal wanted: re-measure whenever the drawing could have changed.
  }, [frames, heap, addresses, stackPointers, measureTick]);

  // A resize or a scroll moves rects without touching the trace, so the
  // measurement above has to run again — the wires would otherwise stay
  // pinned to where the cards used to be.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const remeasure = () => setMeasureTick((t) => t + 1);
    const observer = new ResizeObserver(remeasure);
    observer.observe(container);
    container.addEventListener("scroll", remeasure, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", remeasure);
    };
  }, []);

  const empty = addresses.length === 0 && stackPointers.length === 0;

  return (
    <Panel
      className="min-h-[16rem] flex-1 lg:min-h-0"
      label="Memory &amp; pointers"
      hint={
        <span className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
          <span>{addresses.length} on heap</span>
          <span className="opacity-40">·</span>
          <span>{stackPointers.length} ptr</span>
        </span>
      }
    >
      {empty ? (
        <PanelEmpty>
          Nothing allocated yet. Heap objects and the pointers into them are drawn here as the
          program runs.
        </PanelEmpty>
      ) : (
        <div ref={containerRef} className="relative min-h-full p-3">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <marker
                id="memory-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {wires.map((wire) => (
              <path
                key={wire.key}
                d={wirePath(wire.from, wire.to)}
                fill="none"
                stroke={wire.dangling ? "#f87171" : wire.color}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeDasharray={wire.dangling ? "3 3" : undefined}
                markerEnd={wire.dangling ? undefined : "url(#memory-arrow)"}
                opacity={0.85}
              />
            ))}
          </svg>

          <div className="relative grid gap-3 [grid-template-columns:minmax(7.5rem,10rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)] opacity-70">
                Stack
              </span>
              {stackPointers.length === 0 ? (
                <span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
                  no live pointers
                </span>
              ) : (
                stackPointers.map((pointer) => (
                  <span
                    key={pointer.key}
                    data-anchor={pointer.key}
                    className="flex w-fit max-w-full"
                  >
                    <PointerPill
                      address={pointer.address}
                      dangling={!(pointer.address in heap)}
                      hovered={hoveredRef === pointer.address}
                      onHoverRef={onHoverRef}
                      label={`${pointer.frame}::${pointer.name}`}
                    />
                  </span>
                ))
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)] opacity-70">
                Heap
              </span>
              {addresses.length === 0 ? (
                <span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
                  nothing allocated
                </span>
              ) : (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
                  {addresses.map((address, index) => (
                    <HeapCard
                      key={address}
                      address={address}
                      object={heap[address]}
                      color={heapColor(index)}
                      hovered={hoveredRef === address}
                      onHoverRef={onHoverRef}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function HeapCard({
  address,
  object,
  color,
  hovered,
  onHoverRef,
}: {
  address: string;
  object: HeapObject;
  color: string;
  hovered: boolean;
  onHoverRef: (address: string | null) => void;
}) {
  const fields = Object.keys(object.fields);

  return (
    <div
      data-anchor={`card:${address}`}
      onMouseEnter={() => onHoverRef(address)}
      onMouseLeave={() => onHoverRef(null)}
      className="glass-flat overflow-hidden rounded-lg transition-shadow"
      style={{
        borderColor: hovered ? color : undefined,
        // Composed with the material's own shadow, not instead of it —
        // see `--glass-flat-shadow` in globals.css.
        boxShadow: hovered
          ? `0 0 0 1px ${color}, 0 0 18px -6px ${color}, var(--glass-flat-shadow)`
          : undefined,
      }}
    >
      <div
        className="flex items-center justify-between gap-1.5 px-2 py-1"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
      >
        <span className="truncate font-mono text-[9px] font-medium" style={{ color }}>
          {object.type}
        </span>
        <span className="shrink-0 font-mono text-[8px] text-[var(--text-secondary)]">
          {shortAddress(address)}
        </span>
      </div>

      <ul className="flex flex-col">
        {fields.map((field) => (
          <li
            key={field}
            className="flex items-center gap-1.5 border-t border-[var(--hairline)] px-2 py-[3px] first:border-t-0"
          >
            <span className="w-9 shrink-0 truncate font-mono text-[9px] text-[var(--text-secondary)]">
              {field}
            </span>
            <span className="min-w-0 flex-1 truncate text-right">
              <FieldValue value={object.fields[field]} />
            </span>
            {/* The port an outgoing wire leaves from. Reserved for every
              * field, not just the pointers, so a row's height and its
              * value's right edge don't shift when a null becomes a
              * pointer mid-trace. */}
            <span
              data-anchor={`port:${address}:${field}`}
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: isRef(object.fields[field]) ? color : "var(--hairline-strong)",
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldValue({ value }: { value: TraceValue }) {
  if (isRef(value)) {
    return (
      <span className="font-mono text-[9px]" style={{ color: KIND_COLOR.ref }}>
        {shortAddress(value.ref)}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return <span className="font-mono text-[9px] text-[var(--text-secondary)]">[{value.length}]</span>;
  }
  if (typeof value === "object" && value !== null) {
    return <span className="font-mono text-[9px] text-[var(--text-secondary)]">{"{…}"}</span>;
  }
  return (
    <span className="font-mono text-[9px]" style={{ color: KIND_COLOR[valueKind(value)] }}>
      {scalarText(value)}
    </span>
  );
}

/** A horizontal cubic — pointers read left-to-right here, so both control
 * points are pushed out sideways and the curve leaves and arrives flat
 * regardless of how far apart vertically the two ends are. */
function wirePath(from: Anchor, to: Anchor): string {
  const span = Math.abs(to.x - from.x);
  const bow = Math.max(18, Math.min(70, span * 0.45));
  return `M ${from.x} ${from.y} C ${from.x + bow} ${from.y}, ${to.x - bow} ${to.y}, ${to.x} ${to.y}`;
}

/** Cheap structural equality, so a re-measure that found nothing moved
 * doesn't hand `setWires` a new array and start the effect over. */
function sameWires(a: Wire[], b: Wire[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.key !== y.key ||
      x.color !== y.color ||
      x.dangling !== y.dangling ||
      Math.abs(x.from.x - y.from.x) > 0.5 ||
      Math.abs(x.from.y - y.from.y) > 0.5 ||
      Math.abs(x.to.x - y.to.x) > 0.5 ||
      Math.abs(x.to.y - y.to.y) > 0.5
    ) {
      return false;
    }
  }
  return true;
}
