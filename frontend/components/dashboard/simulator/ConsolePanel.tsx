"use client";

import { memo, useEffect, useRef } from "react";
import Panel from "./Panel";

/**
 * The program's stdout, as its own card beside the editor's.
 *
 * Separate from the editor rather than a strip inside it because it
 * answers a different question. The editor card is the input — the code,
 * the file chip, the run button, the vim state — and everything in it is
 * something you changed. This is the output, and it is the one thing on
 * the page the program itself wrote. Sharing a shell made the transcript
 * read as a footnote to the code; it is the result.
 *
 * It also stops the transcript moving. Inside the editor card it sat
 * above a stack of conditional bands (vim status, stale, truncated,
 * errors) that appear and disappear as you work, and every one of them
 * shifted it.
 *
 * Memoised: the page above re-renders on every keystroke in the editor and
 * on every pointer that crosses a pointer pill, and neither has anything
 * to say about the transcript. Re-rendering anyway is not merely wasted
 * work — the flash effect below is keyed on the rendered text, and the
 * fewer renders it sees the less there is to compare.
 */
const ConsolePanel = memo(function ConsolePanel({
  console: consoleText,
  status,
}: {
  /** Everything the program has printed up to the current step. */
  console: string;
  status: "idle" | "running" | "done" | "error";
}) {
  const flashRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLPreElement>(null);
  /** Last transcript this panel flashed for. A ref rather than state: it
   * is only ever read inside the effect that sets it, and holding it in
   * state would schedule a second render per printed line for nothing. */
  const previousRef = useRef(consoleText);

  // Flash the card whenever the transcript changes.
  //
  // Driven off the rendered text, not off a "the program printed" event,
  // because there is no such event to listen to: the transcript is
  // recomputed from the step deltas on every scrub, so a line appearing
  // and a line being scrubbed back out are the same kind of change and
  // both deserve the same beat of attention.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = consoleText;
    if (consoleText === previous) return;

    // Newest line into view *before* drawing the eye here — flashing a
    // card whose latest output is scrolled out of sight points at stale
    // text.
    const pre = scrollRef.current;
    if (pre) pre.scrollTop = pre.scrollHeight;

    // Nothing to announce when the transcript is cleared (a new run
    // resetting to step 0) — that is the absence of output, and a flash
    // would read as the opposite.
    const flash = flashRef.current;
    if (!flash || consoleText === "") return;

    // Restart, not start: React keeps this element across renders, so a
    // second line arriving mid-animation would not re-trigger it. Reading
    // `offsetWidth` between the two class changes forces the reflow that
    // makes the removal take effect before the re-add.
    //
    // Rewinding through `getAnimations()` instead — no reflow, no forced
    // layout — looks like it should work and does not, which is worth
    // recording here so it doesn't get tried twice. A CSS animation is
    // listed on an element only while it is *relevant*: playing, or
    // holding a value through a fill. This one has no fill, so the moment
    // it finishes it drops off the element entirely. `getAnimations()`
    // then comes back empty and the only thing left to do is add a class
    // the element is already wearing, which changes nothing. The result
    // is a flash that fires once per mount and stays dark for every line
    // after it. A forced layout per printed line is the price of a
    // restart that actually restarts.
    flash.classList.remove("stdout-flash");
    void flash.offsetWidth;
    flash.classList.add("stdout-flash");
  }, [consoleText]);

  return (
    <Panel
      className="h-[7rem] shrink-0"
      label="stdout"
      overlay={<span ref={flashRef} aria-hidden="true" className="stdout-flash-layer" />}
    >
      <pre
        ref={scrollRef}
        className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-[var(--text-primary)]"
      >
        {consoleText || (
          <span className="text-[var(--text-secondary)]">
            {status === "idle" ? "Run the trace to see output." : "—"}
          </span>
        )}
      </pre>
    </Panel>
  );
});

export default ConsolePanel;
