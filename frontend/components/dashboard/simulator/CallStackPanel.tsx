"use client";

import { memo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Frame, StepEvent } from "@/lib/trace-schema/types";
import { downloadPanelImage, renderCallStackImage } from "@/lib/simulator/panel-image";
import Panel, { PanelAction, PanelEmpty, SaveIcon } from "./Panel";

/**
 * The call stack, drawn the way a stack diagram is drawn in a textbook:
 * innermost frame at the top, `main` sitting on the base, and a rail down
 * the left showing how deep the recursion has gone.
 *
 * Clicking a frame is what drives the variables panel beside it — the
 * whole reason to show inactive frames at all is to be able to look inside
 * one that is waiting for a callee to return.
 *
 * Memoised: the page above re-renders on every keystroke in the editor and
 * on every pointer that crosses a pointer pill, and neither has anything
 * to say about the stack. Re-rendering anyway is not merely wasted work —
 * every render hands framer-motion's projection tree a new pass over these
 * rows, which is what a `layout` animation measures against.
 */
const CallStackPanel = memo(function CallStackPanel({
  frames,
  event,
  selectedDepth,
  highlightedDepth,
  onSelect,
}: {
  frames: Frame[];
  /** `call` and `return` are what make a frame's arrival or departure
   * legible; an ordinary `line` step leaves the stack alone. */
  event: StepEvent["event"] | null;
  selectedDepth: number | null;
  /** A frame the reader is pointing at somewhere else — a variable under
   * the cursor in the memory panel's stack view. Ringed rather than
   * filled, so it reads as "over here" without competing with the
   * selection, which is a thing they chose rather than a thing they are
   * touching. */
  highlightedDepth?: number | null;
  onSelect: (depth: number) => void;
}) {
  const top = frames.length - 1;

  const handleSave = useCallback(() => {
    downloadPanelImage(renderCallStackImage(frames, event), "call-stack");
  }, [frames, event]);

  return (
    <Panel
      className="min-h-0"
      label="Call stack"
      hint={
        frames.length > 0 ? (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            depth {frames.length}
          </span>
        ) : undefined
      }
      action={
        <PanelAction
          label="Save every frame and its locals as an SVG"
          onClick={handleSave}
          disabled={frames.length === 0}
        >
          <SaveIcon />
        </PanelAction>
      }
    >
      {frames.length === 0 ? (
        <PanelEmpty>Frames appear here as functions are called.</PanelEmpty>
      ) : (
        <div className="relative px-3 py-2.5">
          {/* The rail. Behind the cards, and stopping short at both ends so
            * it reads as a measure of depth rather than a border. */}
          <span
            aria-hidden="true"
            className="absolute bottom-4 left-[1.1rem] top-4 w-px"
            style={{ background: "var(--hairline)" }}
          />

          <ul className="relative flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {frames
                .map((frame, depth) => ({ frame, depth }))
                .reverse()
                .map(({ frame, depth }) => {
                  const isTop = depth === top;
                  const isSelected = depth === (selectedDepth ?? top);
                  const isHighlighted = depth === highlightedDepth;
                  const localCount = Object.keys(frame.locals).length;

                  return (
                    <motion.li
                      key={`${depth}-${frame.function}`}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(depth)}
                        className="flex w-full items-center gap-2 rounded-lg border py-1.5 pl-2 pr-2.5 text-left transition-[background-color,border-color,box-shadow]"
                        style={{
                          background: isHighlighted
                            ? "color-mix(in srgb, var(--accent-primary) 14%, transparent)"
                            : isSelected
                              ? "var(--bg-elevated)"
                              : "transparent",
                          borderColor: isHighlighted
                            ? "var(--accent-primary)"
                            : isSelected
                              ? "var(--hairline-strong)"
                              : "transparent",
                          boxShadow: isHighlighted
                            ? "0 0 18px -6px var(--accent-primary)"
                            : undefined,
                        }}
                      >
                        {/* Depth marker, doubling as the rail's node. */}
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[8px]"
                          style={{
                            background: isTop ? "var(--accent-primary)" : "var(--bg-elevated)",
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

                        {isTop && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[8px] uppercase tracking-wider ${
                              event === "call" || event === "return" ? "animate-pulse" : ""
                            }`}
                            style={{
                              background: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                              color: "var(--accent-secondary)",
                            }}
                          >
                            {event === "return" ? "returning" : "running"}
                          </span>
                        )}

                        <span className="shrink-0 font-mono text-[9px] text-[var(--text-secondary)]">
                          {localCount}
                          <span className="opacity-60">v</span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
            </AnimatePresence>
          </ul>

          <div className="mt-2 pl-[1.6rem] font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-secondary)] opacity-60">
            stack base
          </div>
        </div>
      )}
    </Panel>
  );
});

export default CallStackPanel;
