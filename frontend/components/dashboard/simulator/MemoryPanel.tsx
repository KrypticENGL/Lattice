"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Frame, HeapObject, TraceValue } from "@/lib/trace-schema/types";
import {
  heapColor,
  isRef,
  KIND_COLOR,
  scalarText,
  slotLabels,
  typeLabel,
  valueKind,
} from "@/lib/simulator/values";
import {
  downloadPanelImage,
  renderCallStackImage,
  renderMemoryImage,
} from "@/lib/simulator/panel-image";
import { heapPointers, slotAddresses, stackPointers } from "@/lib/simulator/pointers";
import { layoutHeap } from "@/lib/simulator/layout";
import {
  BAND_GAP,
  COLUMN_GAP,
  LANE_ROOM,
  routeWires,
  type Rect,
  type RoutedWire,
  type WireRequest,
} from "@/lib/simulator/wires";
import Dropdown from "../Dropdown";
import Panel, { PanelAction, PanelEmpty, SaveIcon } from "./Panel";
import { useAddressLabel } from "./AddressLabels";
import { PointerPill, ValueView } from "./VariablesPanel";

/** The two readings of memory this panel offers, chosen by the switcher
 * under its header. */
type MemoryView = "heap" | "stack";

const VIEW_LABEL: Record<MemoryView, string> = {
  heap: "Heap pointers",
  stack: "Stack visualization",
};

/**
 * The memory diagram: pointers on the left, the heap on the right, and a
 * drawn line for every one that leads somewhere.
 *
 * Objects are placed by lib/simulator/layout.ts — in columns, by how many
 * hops they are from an object nothing else points at — and the wires
 * between them are routed by lib/simulator/wires.ts. Neither decision is
 * made here, because lib/simulator/panel-image.ts makes both of them
 * again when the diagram is saved to a file, and a saved picture that
 * arranges the same heap differently is a picture of a different program.
 *
 * The arrows are measured, not laid out. A card grows with its field list
 * and a column is as tall as its cards, so there is no arithmetic here
 * that could predict where a port ends up — the ports and cards register
 * their own DOM nodes and this measures them after paint. That is also
 * what makes the wires survive a scroll, a window resize and a step that
 * adds a field, all of which just move a rect.
 *
 * The switcher under the header offers a second reading of the same
 * machine, from the other end. `Stack visualization` draws every frame
 * with every variable it is holding — the thing neither of the other two
 * panels can show, since the call stack lists frames without their
 * contents and the variables panel shows one frame's contents at a time.
 * Pointing at a frame there rings the same frame in the call stack, so
 * the two readings of the stack stay tied to each other.
 *
 * Memoised: the page above re-renders on every keystroke in the editor and
 * on every pointer that crosses a pointer pill, and neither has anything
 * to say about the heap. Re-rendering anyway is not merely wasted work — a
 * render re-runs the measuring pass below, and that is a forced
 * synchronous layout of the whole diagram.
 */
const MemoryPanel = memo(function MemoryPanel({
  frames,
  heap,
  hoveredRef,
  onHoverRef,
  hoveredDepth,
  onHoverDepth,
}: {
  frames: Frame[];
  heap: Record<string, HeapObject>;
  hoveredRef: string | null;
  onHoverRef: (address: string | null) => void;
  /** Which frame the cursor is over in the stack view. Held by the page
   * rather than here, because the panel that has to *react* to it is the
   * call stack on the other side of the column. */
  hoveredDepth: number | null;
  onHoverDepth: (depth: number | null) => void;
}) {
  const [view, setView] = useState<MemoryView>("heap");
  const containerRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<RoutedWire[]>([]);

  const addresses = useMemo(() => Object.keys(heap), [heap]);

  // Every pointer at this step, split by where it lives: the stack ones
  // become pills in the left lane, the heap ones become ports on the card
  // that owns them. Both come from lib/simulator/pointers.ts rather than
  // being found here, because the state export writes out the same two
  // lists and the file must describe the drawing it came from.
  const lanePointers = useMemo(() => stackPointers(frames), [frames]);
  const portPointers = useMemo(() => heapPointers(heap), [heap]);
  const layout = useMemo(() => layoutHeap(heap), [heap]);

  /** A card's colour is its position in the heap's own key order, which is
   * also what `heapPointers` indexes by — so a card and the wires leaving
   * it are the same colour. Not its position in the layout: the layout
   * re-orders objects as the program runs, and a card that changed colour
   * because a pointer moved would be reporting the wrong thing. */
  const colorIndex = useMemo(
    () => new Map(addresses.map((address, index) => [address, index])),
    [addresses],
  );

  /** Read every anchor's position and re-route the wires from it.
   *
   * A plain callback rather than an effect body so that the things which
   * only *move* rects — a scroll, a resize, the sidebar opening — can call
   * it directly. It used to be reached by bumping a counter in state,
   * which cost a full render of the diagram before the measurement and a
   * second one after it; during a 300ms width transition that is two
   * renders of every heap card per frame to answer a question about
   * geometry the DOM already knows. */
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const origin = container.getBoundingClientRect();

    /** A measured node's box in the panel's own coordinates.
     *
     * Anchors are found by `data-anchor` rather than registered through
     * callback refs: a ref map would have to be written during commit and
     * read here, and the DOM already holds exactly that mapping. */
    const rectOf = (selector: string): Rect | null => {
      const node = container.querySelector<HTMLElement>(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height };
    };

    const cards = new Map<string, Rect>();
    for (const address of addresses) {
      const rect = rectOf(anchor(`card:${address}`));
      if (rect) cards.set(address, rect);
    }

    const bands: Rect[] = [];
    for (let i = 0; i < layout.bands.length; i++) {
      const rect = rectOf(`[data-band="${i}"]`);
      if (rect) bands.push(rect);
    }

    const requests: WireRequest[] = [];
    const push = (key: string, target: string, color: string, owner?: string) => {
      const rect = rectOf(anchor(key));
      if (!rect) return;
      requests.push({
        key,
        from: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
        owner,
        target,
        color,
      });
    };

    for (const pointer of lanePointers) {
      push(pointer.key, pointer.address, "var(--text-secondary)");
    }
    for (const pointer of portPointers) {
      push(pointer.key, pointer.target, heapColor(pointer.index), pointer.address);
    }

    const bounds = { x: 0, y: 0, w: origin.width, h: origin.height };
    // Stack pointers go over the top of a band, heap pointers underneath,
    // so the two kinds never share a lane.
    const next = routeWires(requests, cards, bands, bounds, (request) => !request.owner);

    setWires((previous) => (sameWires(previous, next) ? previous : next));
    // `heap` is a fresh object each step, which is exactly the signal
    // wanted: re-measure whenever the drawing could have changed.
  }, [addresses, layout, lanePointers, portPointers]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  const heapEmpty = addresses.length === 0 && lanePointers.length === 0;
  const empty = view === "heap" ? heapEmpty : frames.length === 0;

  /** Saves whichever drawing is on screen. The stack view and the call
   * stack panel's own export are the same picture — one function draws
   * both — so a reader who saves from here gets what they were looking
   * at rather than the panel's other half. */
  const handleSave = useCallback(() => {
    if (view === "stack") {
      downloadPanelImage(renderCallStackImage(frames, null), "stack-visualization");
      return;
    }
    downloadPanelImage(renderMemoryImage(frames, heap), "memory-and-pointers");
  }, [view, frames, heap]);

  /** Switching away from the stack view has to take its highlight with
   * it: the ring in the call stack is this panel's, and leaving one lit
   * on a view that is no longer on screen would point at nothing. */
  const handleViewChange = useCallback(
    (next: MemoryView) => {
      setView(next);
      onHoverDepth(null);
    },
    [onHoverDepth],
  );

  /** Kept in a ref so the observer below can be installed once and still
   * call the current measurement — re-subscribing a ResizeObserver on
   * every step would be a teardown per trace step for no gain. */
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  // A resize moves rects without touching the trace, so the measurement
  // above has to run again — the wires would otherwise stay pinned to
  // where the cards used to be. Scrolling does not: every coordinate here
  // is relative to this box, which scrolls along with its contents.
  //
  // Coalesced to one call per frame. The sidebar opening resizes this
  // panel for 300ms straight, and only the last width of a frame is the
  // one that gets painted, so anything measured before it is work thrown
  // away.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const remeasure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measureRef.current();
      });
    };

    const observer = new ResizeObserver(remeasure);
    observer.observe(container);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The heap diagram swaps in and out of the tree with `heapEmpty` and
    // with the view, so the observer has to be re-attached to the node
    // that actually exists — and torn down when there isn't one.
  }, [heapEmpty, view]);

  /** The cards and pills themselves, held still across a re-measure.
   *
   * Every wire update sets state, and a resize produces one per frame —
   * without this, each of those frames would re-render every heap card and
   * every pointer pill to arrive at exactly the same markup. Nothing here
   * depends on `wires`, so the only thing a measurement changes is the
   * `<svg>` above it. */
  const diagram = useMemo(
    () => (
      <div className="relative flex items-start gap-10">
        <div className="flex w-40 shrink-0 flex-col gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)] opacity-70">
            Stack
          </span>
          {/* The same reserve the bands take, so the first pill and the
            * first card start on the same line — the lane's wires read
            * as going straight across only if they do. */}
          <div className="flex flex-col gap-1.5" style={{ paddingTop: LANE_ROOM }}>
            {lanePointers.length === 0 ? (
              <span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
                no live pointers
              </span>
            ) : (
              lanePointers.map((pointer) => (
                <span key={pointer.key} data-anchor={pointer.key} className="flex w-fit max-w-full">
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
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)] opacity-70">
            Heap
          </span>
          {addresses.length === 0 ? (
            <span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
              nothing allocated
            </span>
          ) : (
            // Bands stack downwards, columns run across, cards down a
            // column — the shape lib/simulator/layout.ts chose. The gaps
            // are the drawing's working space, not decoration: the
            // column gap is where a forward wire's curve lives and the
            // band gap is where a wire that has to go the long way round
            // runs, so they are the router's own numbers rather than
            // whichever Tailwind step looked right.
            // The reserve at top and bottom is the outermost lane's: a
            // wire that goes under the last band runs below every card in
            // it, and without the room to do so it is drawn past the edge
            // of a box that has no reason to scroll that far.
            <div
              className="flex flex-col"
              style={{ gap: BAND_GAP, paddingTop: LANE_ROOM, paddingBottom: LANE_ROOM }}
            >
              {layout.bands.map((band, index) => (
                <div
                  key={index}
                  data-band={index}
                  className="flex items-start"
                  style={{ gap: COLUMN_GAP }}
                >
                  {band.map((column, columnIndex) => (
                    <div key={columnIndex} className="flex w-[10.5rem] shrink-0 flex-col gap-3">
                      {column.map((address) => (
                        <HeapCard
                          key={address}
                          address={address}
                          object={heap[address]}
                          color={heapColor(colorIndex.get(address) ?? 0)}
                          hovered={hoveredRef === address}
                          onHoverRef={onHoverRef}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    [lanePointers, addresses, layout, colorIndex, heap, hoveredRef, onHoverRef],
  );

  /** Where each local lives, written short.
   *
   * Labelled as its own set, never pooled with the heap's — see
   * `slotAddresses`. Empty for a trace recorded before the tracer reported
   * slots, and for a program whose locals the compiler kept in registers,
   * which is what the column below checks before it takes up any width.
   *
   * Keyed to `frames` only, so this survives every re-render the heap
   * causes. */
  const slots = useMemo(() => slotLabels(slotAddresses(frames)), [frames]);
  const hasSlots = slots.size > 0;

  /** Every frame, and everything each one is holding.
   *
   * Innermost first, the way the call stack beside it stacks them, so the
   * two columns can be read across. The hover is on the whole frame block
   * rather than on each row: what a variable answers here is *which frame
   * am I in*, and moving between two variables of one frame should not
   * make the answer flicker.
   *
   * Each row opens with the variable's own address, which is the one thing
   * this view can say that the Variables panel can't: read down a frame and
   * the locals are a few bytes apart, read across two frames and they are
   * nowhere near each other — the stack, drawn as memory rather than as a
   * list of names. The column only exists when the step actually has
   * addresses to put in it; a trace without them keeps the old layout
   * rather than growing a gutter of dashes. */
  const stackView = useMemo(
    () => (
      <div className="flex flex-col gap-2 p-3">
        {frames
          .map((frame, depth) => ({ frame, depth }))
          .reverse()
          .map(({ frame, depth }) => {
            const names = Object.keys(frame.locals);
            const isTop = depth === frames.length - 1;
            const hovered = depth === hoveredDepth;

            return (
              <div
                key={`${depth}-${frame.function}`}
                onMouseEnter={() => onHoverDepth(depth)}
                onMouseLeave={() => onHoverDepth(null)}
                className="glass-flat overflow-hidden rounded-lg transition-shadow"
                style={{
                  borderColor: hovered ? "var(--accent-primary)" : undefined,
                  // Composed with the material's own shadow, the same way
                  // a hovered heap card is — see `--glass-flat-shadow`.
                  boxShadow: hovered
                    ? "0 0 0 1px var(--accent-primary), 0 0 18px -6px var(--accent-primary), var(--glass-flat-shadow)"
                    : undefined,
                }}
              >
                <div
                  className="flex items-center gap-2 px-2 py-1"
                  style={{
                    background: isTop
                      ? "color-mix(in srgb, var(--accent-primary) 18%, transparent)"
                      : "var(--bg-elevated)",
                  }}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[8px]"
                    style={{
                      background: isTop ? "var(--accent-primary)" : "var(--bg-surface)",
                      color: isTop ? "var(--bg-base)" : "var(--text-secondary)",
                      border: isTop ? "none" : "1px solid var(--hairline)",
                    }}
                  >
                    {depth}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11px]"
                    style={{ color: isTop ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    {frame.function}
                    <span className="text-[var(--text-secondary)]">()</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-[var(--text-secondary)]">
                    {names.length}
                    <span className="opacity-60">v</span>
                  </span>
                </div>

                {names.length === 0 ? (
                  <p className="px-2.5 py-1.5 font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
                    no locals in scope yet
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[var(--hairline)]">
                    {names.map((name) => (
                      <li key={name} className="flex items-start gap-2 px-2.5 py-1">
                        {hasSlots && (
                          <SlotAddress name={name} address={frame.addrs?.[name]} labels={slots} />
                        )}
                        <span className="w-[4.5rem] shrink-0 truncate font-mono text-[11px] text-[var(--text-primary)]">
                          {name}
                        </span>
                        <span className="w-[2.6rem] shrink-0 truncate font-mono text-[8px] uppercase tracking-wider text-[var(--text-secondary)]">
                          {typeLabel(frame.locals[name])}
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* The variables panel's own renderer, not a
                            * second one: the same local is on screen in
                            * both places at once, and two drawings of it
                            * would be two chances to disagree. */}
                          <ValueView
                            value={frame.locals[name]}
                            heap={heap}
                            hoveredRef={hoveredRef}
                            onHoverRef={onHoverRef}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    ),
    [frames, heap, hoveredRef, onHoverRef, hoveredDepth, onHoverDepth, slots, hasSlots],
  );

  const totalLocals = frames.reduce((n, frame) => n + Object.keys(frame.locals).length, 0);

  return (
    <Panel
      className="min-h-[16rem] flex-1 lg:min-h-0"
      label="Memory &amp; pointers"
      hint={
        <span className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
          {view === "heap" ? (
            <>
              <span>{addresses.length} on heap</span>
              <span className="opacity-40">·</span>
              <span>{lanePointers.length} ptr</span>
            </>
          ) : (
            <>
              <span>depth {frames.length}</span>
              <span className="opacity-40">·</span>
              <span>{totalLocals} vars</span>
            </>
          )}
        </span>
      }
      control={<ViewSwitcher value={view} onChange={handleViewChange} />}
      action={
        <PanelAction
          label={
            view === "heap"
              ? "Save the memory diagram as an SVG"
              : "Save every frame and its locals as an SVG"
          }
          onClick={handleSave}
          disabled={empty}
        >
          <SaveIcon />
        </PanelAction>
      }
    >
      {empty ? (
        <PanelEmpty>
          {view === "heap"
            ? "Nothing allocated yet. Heap objects and the pointers into them are drawn here as the program runs."
            : "Nothing on the stack yet. Every frame and the variables it holds are drawn here as the program runs."}
        </PanelEmpty>
      ) : view === "stack" ? (
        stackView
      ) : (
        // `w-max` so the box is as wide as the columns are, rather than
        // as wide as the panel: the scrolling is the panel's, and this
        // has to be the full size of the drawing for the SVG below to
        // cover all of it.
        <div ref={containerRef} className="relative w-max min-w-full p-3">
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
            {wires.map((wire) => {
              // With a card hovered, the wires that touch it are the
              // answer to "what points at this, and what does it point
              // at" — the rest are the noise that question is being
              // asked over, so they step back rather than disappear.
              const lit =
                hoveredRef === null || wire.target === hoveredRef || wire.owner === hoveredRef;
              return (
                <path
                  key={wire.key}
                  d={wire.path}
                  fill="none"
                  stroke={wire.dangling ? "#f87171" : wire.color}
                  strokeWidth={lit && hoveredRef !== null ? 2 : 1.4}
                  strokeLinecap="round"
                  strokeDasharray={wire.dangling ? "3 3" : undefined}
                  markerEnd={wire.dangling ? undefined : "url(#memory-arrow)"}
                  opacity={lit ? 0.9 : 0.18}
                  className="transition-opacity duration-150"
                />
              );
            })}
          </svg>

          {diagram}
        </div>
      )}
    </Panel>
  );
});

export default MemoryPanel;

/** An anchor key, quoted into an attribute selector.
 *
 * Not `CSS.escape` — that escapes a value into an *identifier*, and the
 * `card:obj_…` it would hand back has the colon backslashed, which then
 * fails to match the attribute whose value is a plain colon. Inside the
 * quotes only the quote and the backslash mean anything. */
function anchor(key: string): string {
  return `[data-anchor="${key.replace(/["\\]/g, "\\$&")}"]`;
}

/**
 * The panel's scope switcher, as a pill on the title line.
 *
 * A dropdown rather than a pair of toggle buttons. Two options today, but
 * they are two *readings of memory* rather than two settings, and a
 * dropdown says "the panel is showing one of these" where a segmented
 * toggle says "both of these are on or off".
 *
 * `components/dashboard/Dropdown.tsx` rather than a `<select>`, because
 * the platform draws a native control's open list outside this document
 * where no CSS reaches it — see that file's header. The keyboard and
 * screen-reader behaviour a `<select>` came with is rebuilt there; what
 * this file has to know about it is only that the button is a
 * `role="combobox"`, which is what the page's arrow-key scrubbing steps
 * aside for — see the keydown guard in CodeFlowSimulator.
 *
 * Sized and lettered to the header strip it sits in rather than to a form
 * control: 9px uppercase mono, the same as the label beside it, so the
 * two read as one line. `shrink-0` (the Dropdown's own) against the
 * label's `truncate`, which settles what gives first when the panel is
 * narrow — the title, whose missing letters can be inferred, rather than
 * the control, whose can't.
 */
const VIEW_OPTIONS = (Object.keys(VIEW_LABEL) as MemoryView[]).map((view) => ({
  value: view,
  label: VIEW_LABEL[view],
}));

function ViewSwitcher({
  value,
  onChange,
}: {
  value: MemoryView;
  onChange: (view: MemoryView) => void;
}) {
  return (
    <Dropdown
      value={value}
      options={VIEW_OPTIONS}
      onChange={onChange}
      label="What this panel shows"
    />
  );
}

/**
 * One local's stack slot, in the column each row of the stack view opens
 * with.
 *
 * A variable with no slot still gets the column — a dash, not a gap. The
 * alternative is a row whose name begins where every other row's address
 * does, which reads as a different kind of row rather than as the same
 * row missing one fact. What is missing is said in the tooltip, since a
 * register-held variable having no address is a fact about the program
 * worth being able to find out, just not one worth a column of its own.
 *
 * The full address is in the tooltip either way: the label is a tail,
 * chosen so the tails in one step differ (see `slotLabels`), and a reader
 * who wants the whole number of a slot should not have to export the
 * drawing to get it.
 */
function SlotAddress({
  name,
  address,
  labels,
}: {
  name: string;
  address: string | undefined;
  labels: Map<string, string>;
}) {
  return (
    <span
      title={
        address
          ? `&${name} — ${address}`
          : `${name} has no address: the compiler kept it in a register`
      }
      className="w-[3.4rem] shrink-0 truncate pt-px font-mono text-[9px] text-[var(--text-secondary)] opacity-70"
    >
      {address ? (labels.get(address) ?? address) : "—"}
    </span>
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
  const labelOf = useAddressLabel();

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
          {labelOf(address)}
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
  const labelOf = useAddressLabel();

  if (isRef(value)) {
    return (
      <span className="font-mono text-[9px]" style={{ color: KIND_COLOR.ref }}>
        {labelOf(value.ref)}
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

/** Cheap structural equality, so a re-measure that found nothing moved
 * doesn't hand `setWires` a new array and start the effect over. */
function sameWires(a: RoutedWire[], b: RoutedWire[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].path !== b[i].path || a[i].color !== b[i].color) return false;
    if (a[i].dangling !== b[i].dangling) return false;
  }
  return true;
}
