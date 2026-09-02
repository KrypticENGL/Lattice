/**
 * Turning a saved workspace into something a post can carry.
 *
 * The awkward part, and the reason this is its own module: a post shows a
 * *drawing*, and nothing stores drawings. Traces are recomputed per run
 * and streamed to whoever asked, so a canvas sitting in the database is
 * source code and a resume step — there is no picture to read back off it.
 *
 * So attaching runs the code. `traceWorkspace` executes the canvas (or the
 * C++ its graph compiles to) exactly the way the Visualizer would, and
 * hands back every step that draws something, for the author to pick from.
 * That is what makes `stepLabel` on the attachment honest: the post is a
 * particular moment of a particular run, chosen by the person posting it.
 *
 * The cost is that attaching is a round trip and that code which does not
 * compile cannot be attached — both of which are the truth about a post
 * built on a trace, rather than limitations worth designing around.
 */

import { generateCpp } from "@/lib/code-canvas/codegen";
import type { CanvasGraph } from "@/lib/code-canvas/graph";
import { buildDiagram, type Diagram } from "@/lib/shape-detection";
import { runTrace } from "@/lib/trace-schema/execute";
import { isTruncated, type StepEvent } from "@/lib/trace-schema/types";
import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import type { CanvasAttachment } from "./types";

/** A workspace the author can attach, flattened from the two kinds that
 * exist so the picker can list them together. */
export type Attachable = {
  id: string;
  source: "canvas" | "code-canvas";
  name: string;
  language: Language;
  updatedAt: string;
  /** Present for a Code-Canvas graph, and for a Visualizer canvas that was
   * generated from one. Carried into the attachment so the `.lattice` file
   * can hand over blocks, not just text. */
  graph: CanvasGraph | null;
  /** The code to run. For a graph this is what `generateCpp` made of it. */
  code: string;
};

/** One step of a run that has something to draw. Steps whose heap holds
 * nothing reachable produce no diagram, and offering the author a frame
 * that renders empty would be offering them a broken post. */
export type TraceableStep = {
  index: number;
  label: string;
  diagram: Diagram;
};

export class AttachError extends Error {}

/**
 * Runs a workspace and returns every step worth showing.
 *
 * Throws rather than returning an empty list for the two failures the
 * author has to act on — code that will not compile, and code that runs
 * but never builds a structure — because both need different words and
 * neither is something the picker can silently skip.
 */
export async function traceWorkspace(
  item: Attachable,
  token: string | null,
): Promise<TraceableStep[]> {
  if (!item.code.trim()) {
    throw new AttachError(`"${item.name}" has no code in it yet.`);
  }

  const result = await runTrace(item.language, item.code, token);
  const steps: TraceableStep[] = [];
  for (const event of result.trace) {
    if (isTruncated(event)) continue;
    const step = event as StepEvent;
    const diagram = buildDiagram(step);
    // `buildDiagram` returns null for a step with nothing on the heap to
    // draw — the top of `main`, a run that only prints. Those are real
    // steps, just not pictures.
    if (diagram) steps.push({ index: step.step, label: stepLabel(step), diagram });
  }

  if (steps.length === 0) {
    throw new AttachError(
      `"${item.name}" ran, but never built anything to draw. Allocate a structure and it can be posted.`,
    );
  }
  return steps;
}

/** What the post says under the drawing. The line number is what a reader
 * can find again in the code; the function is what makes it mean
 * something. */
function stepLabel(step: StepEvent): string {
  const where = step.function ? `${step.function}()` : "top level";
  return `${where} · line ${step.line}`;
}

export function toAttachment(item: Attachable, step: TraceableStep): CanvasAttachment {
  return {
    canvasId: item.id,
    source: item.source,
    name: item.name,
    language: item.language,
    stepLabel: step.label,
    diagram: step.diagram,
    graph: item.graph,
    code: item.code,
  };
}

/** Flattens a Code-Canvas graph into something attachable, compiling it
 * the same way the Code-Canvas page's own preview does. */
export function graphAttachable(
  id: string,
  name: string,
  graph: CanvasGraph,
  updatedAt: string,
): Attachable {
  return {
    id,
    source: "code-canvas",
    name,
    language: "cpp",
    updatedAt,
    graph,
    code: generateCpp(graph).code,
  };
}
