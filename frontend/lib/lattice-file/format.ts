/**
 * The `.lattice` file format.
 *
 * One file holding a piece of Lattice work, in up to three parts:
 *
 *   - **the code** — a buffer and the language it is written in;
 *   - **the code-canvas** — the node graph that code was built from;
 *   - **the visualizer** — the traced graph, the drawing of that code
 *     running.
 *
 * The point is that they travel together. A Code-Canvas graph without its
 * code cannot be read by anything but this app, and code without its graph
 * cannot be edited back into blocks; a Visualizer drawing without the
 * source it was traced from is a picture of a program you no longer have.
 * Bundling a preview as well means the file says what it is before
 * anything opens it.
 *
 * ## Every part is optional, and that is the interesting part
 *
 * A file exported from Code-Canvas has the code and the graph and no
 * trace. One exported from the Visualizer has the code and the trace and
 * no graph. Both are `.lattice` files, and either page can be handed
 * either one — so a reader cannot assume the part it needs is there.
 * `parseLatticeFile` therefore returns whatever it found rather than
 * insisting on a shape, and each page states what it requires through
 * `missingSections`, which is what turns "this file has no graph in it"
 * into something a person can be told.
 *
 * A file with none of the three is the one genuine failure: there is
 * nothing in it to open anywhere.
 *
 * ## Why JSON
 *
 * The code, the graph, the trace and the preview are already text, and
 * every other payload in this project crosses the wire as JSON. A
 * container format (zip, tar) would buy compression this does not need
 * and cost the two things plain JSON gives for free: it diffs in git, and
 * a person can open it in an editor and see what is in their file.
 *
 * ## The trace, and why it is in here after all
 *
 * v1 deliberately left the trace out: it is an output, it is reproducible
 * by running the code, it is by far the largest thing in a workspace
 * (§6.3 caps a run at 5000 steps), and it goes stale the instant the code
 * is edited. All of that is still true — and none of it survives the
 * requirement that a `.lattice` file carry a Visualizer graph, because the
 * trace *is* the Visualizer graph. There is no drawing without it.
 *
 * What follows from that is the honesty rule this format keeps: the trace
 * is stored next to the exact source it was produced from, never on its
 * own. A reader that opens one gets both, so the line the drawing is
 * pointing at is a line that exists.
 *
 * ## Versioning
 *
 * `version` is the schema number, bumped only for a change a previous
 * reader could not cope with. Readers must accept unknown extra keys and
 * refuse a version they do not know, which is why `parseLatticeFile`
 * checks the number before it looks at anything else.
 *
 * v1 → v2 added `visualizer` and made `graph` and `code` optional. Every
 * v1 file is a valid v2 file, so v1 is read here without a migration; a v1
 * *reader* handed a v2 Visualizer export will refuse it for having no
 * graph, which is exactly what it should do.
 */

import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import { parseGraph, type CanvasGraph } from "@/lib/code-canvas/graph";
import { buildDiagram } from "@/lib/shape-detection";
import { isTruncated, type StepEvent, type TraceEvent } from "@/lib/trace-schema/types";
import { renderDiagramPreview, renderGraphPreview, type GraphPreview } from "./preview";

/** Current schema version. */
export const LATTICE_VERSION = 2;

/** The tag every file carries, so a reader can reject a JSON document
 * that merely happens to have the right extension. */
export const LATTICE_MAGIC = "lattice";

export const LATTICE_EXTENSION = ".lattice";

/** Vendor MIME type. Nothing in the OS knows it, which is the point: it
 * is what the download is labelled so the browser saves rather than
 * renders, and what an `accept` filter can name later. */
export const LATTICE_MIME = "application/vnd.lattice+json";

export type LatticeCode = {
  language: Language;
  source: string;
  /** Codegen's warnings about parts of the graph it could not compile —
   * carried so a reader knows the code is a partial rendering of the
   * graph rather than silently believing it is complete. Empty for a
   * hand-written buffer, which has nothing to warn about. */
  notes: string[];
};

/**
 * The Visualizer's half: a run, and where in it the reader was looking.
 *
 * Everything here comes off the canvas the run was recorded on, except
 * that the code is *not* here — it is `code`, shared with the rest of the
 * file, because there is only ever one program in a `.lattice` and the
 * trace is a recording of it.
 */
export type LatticeVisualizer = {
  /** The run, sentinel included: the truncation marker is part of what
   * the backend said and `truncated` below is only the summary of it. */
  trace: TraceEvent[];
  /** The step the drawing was showing, so a file opens on the moment its
   * author was looking at rather than back at step one. */
  stepIndex: number;
  stdout: string | null;
  truncated: boolean;
  compileCommand: string | null;
  compilerOutput: string | null;
};

export type LatticeFile = {
  format: typeof LATTICE_MAGIC;
  version: number;
  /** The work's name, used to suggest a filename on export. */
  name: string;
  /** When the file was written, ISO 8601. */
  savedAt: string;
  /** The code. Null in a file that carries only a graph. */
  code: LatticeCode | null;
  /** The Code-Canvas node graph. Null in a Visualizer export. */
  graph: CanvasGraph | null;
  /** The Visualizer's traced graph. Null in a Code-Canvas export. */
  visualizer: LatticeVisualizer | null;
  /** A picture of whichever drawing this file has. Null only if it has
   * neither, which is to say if it holds nothing but code. */
  preview: GraphPreview | null;
};

/* ------------------------------------------------------------------ */
/* Naming the parts                                                    */
/* ------------------------------------------------------------------ */

/** The three things a `.lattice` file can hold, named as a reader would
 * name them rather than as the schema spells them. */
export type LatticeSection = "visualizer" | "code" | "code-canvas";

/** True when the file actually carries that part. */
export function hasSection(file: LatticeFile, section: LatticeSection): boolean {
  switch (section) {
    case "visualizer":
      return file.visualizer !== null;
    case "code":
      return file.code !== null;
    case "code-canvas":
      return file.graph !== null;
  }
}

/**
 * Which of `required` this file does not have, in the order asked for.
 *
 * The order is the caller's, so a page can put the part it most obviously
 * needs first and have that be the one the reader is told about — being
 * handed a Code-Canvas file on the Visualizer should say the visualizer
 * data is missing, not start with a remark about the code.
 */
export function missingSections(
  file: LatticeFile,
  required: readonly LatticeSection[],
): LatticeSection[] {
  return required.filter((section) => !hasSection(file, section));
}

/** The sentence shown when a file is missing a part the page needs. */
export function missingSectionMessage(section: LatticeSection): string {
  return `${section} data is not present in this file`;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Builds a file from the pieces a page already has in hand.
 *
 * The preview is rendered here rather than passed in, so there is exactly
 * one way a `.lattice` preview can come to exist and it cannot disagree
 * with the drawing beside it in the same file. Which drawing gets pictured
 * follows from what is present: a Code-Canvas graph if there is one, since
 * that is the thing you would edit; otherwise the traced structure at the
 * step the file was saved on.
 */
export function buildLatticeFile(input: {
  name: string;
  code?: LatticeCode | null;
  graph?: CanvasGraph | null;
  visualizer?: LatticeVisualizer | null;
  /** Injectable only so tests can pin it; defaults to now. */
  savedAt?: Date;
}): LatticeFile {
  const graph = input.graph ?? null;
  const visualizer = input.visualizer ?? null;

  return {
    format: LATTICE_MAGIC,
    version: LATTICE_VERSION,
    name: input.name,
    savedAt: (input.savedAt ?? new Date()).toISOString(),
    code: input.code ?? null,
    graph,
    visualizer,
    preview: graph
      ? renderGraphPreview(graph)
      : visualizer
        ? renderDiagramPreview(diagramAt(visualizer))
        : null,
  };
}

/** The step a Visualizer section was saved on, laid out. Clamped rather
 * than trusted: `stepIndex` is a saved cursor and the trace it indexes
 * into can be shorter than it was. */
function diagramAt(visualizer: LatticeVisualizer) {
  const steps = visualizer.trace.filter((e): e is StepEvent => !isTruncated(e));
  if (steps.length === 0) return null;
  const step = steps[Math.min(Math.max(visualizer.stepIndex, 0), steps.length - 1)];
  return buildDiagram(step);
}

/** Pretty-printed with two spaces, deliberately: these files are meant to
 * be diffable and readable, and the size difference against minified JSON
 * is irrelevant next to the embedded SVG. */
export function serializeLatticeFile(file: LatticeFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * A filename that will not surprise the OS.
 *
 * A graph may legitimately be called `List<int> / v2`, and neither slash
 * nor angle bracket survives contact with a filesystem. Each run of
 * characters outside `[A-Za-z0-9-_]` collapses to a single dash — dropping
 * them instead would run the words together, turning `List<int>` into
 * `Listint`.
 */
export function suggestFileName(name: string): string {
  const stem =
    name
      .trim()
      .replace(/[^a-zA-Z0-9-_ ]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "canvas";
  return `${stem}${LATTICE_EXTENSION}`;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export type ParseResult =
  | { ok: true; file: LatticeFile }
  | { ok: false; error: string };

const LANGUAGES: Language[] = ["cpp", "javascript", "typescript", "python", "rust"];

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Validates one trace event as far as anything downstream depends on it.
 *
 * Not a full schema check — the point is narrower than that. `buildDiagram`
 * walks `frames` and `heap` and indexes into them, and a hand-edited file
 * that put a string where the heap goes would crash the drawing rather
 * than fail to open. These are the fields that are read without asking.
 */
function isTraceEvent(value: unknown): value is TraceEvent {
  if (!isObject(value)) return false;
  if (value.event === "truncated") return true;
  return (
    typeof value.step === "number" &&
    typeof value.line === "number" &&
    typeof value.event === "string" &&
    typeof value.stdout_delta === "string" &&
    Array.isArray(value.frames) &&
    value.frames.every(isObject) &&
    isObject(value.heap)
  );
}

/**
 * Reads a `.lattice` document.
 *
 * Written as a total function returning a reason rather than one that
 * throws, because every caller is a file the user picked and every
 * failure is something they need told: the wrong file, a newer version, a
 * truncated download. Each check below corresponds to a message worth
 * showing.
 *
 * Only two things are refused: a document that is not one of ours, and one
 * that holds none of the three parts. A part that is absent, or present
 * but unreadable, comes back as `null` and becomes the caller's business —
 * a page asked to open a file missing the part it needs can say so far
 * more usefully than this function can, because it knows which part it
 * wanted. Treating a corrupt section as an absent one is deliberate for
 * the same reason: a mangled trace should not stop the Code-Canvas graph
 * in the same file from opening.
 *
 * Unknown extra keys are preserved by being ignored — a file written by a
 * later version that only *added* fields still opens here, which is the
 * whole reason `version` is checked against known values rather than
 * assumed.
 */
export function parseLatticeFile(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON — it may be truncated or not a .lattice file." };
  }

  if (!isObject(data)) {
    return { ok: false, error: "That file doesn't contain a Lattice document." };
  }

  const value = data;

  if (value.format !== LATTICE_MAGIC) {
    return { ok: false, error: "That isn't a .lattice file — it's missing the format marker." };
  }

  if (typeof value.version !== "number" || !Number.isFinite(value.version)) {
    return { ok: false, error: "That file doesn't say which .lattice version it is." };
  }

  if (value.version > LATTICE_VERSION) {
    return {
      ok: false,
      error: `That file was written by a newer version of Lattice (format v${value.version}, this build reads v${LATTICE_VERSION}).`,
    };
  }

  const graph = parseGraph(value.graph) ?? null;

  const rawCode = isObject(value.code) ? value.code : null;
  const code: LatticeCode | null =
    rawCode && typeof rawCode.source === "string"
      ? {
          language: isLanguage(rawCode.language) ? rawCode.language : "cpp",
          source: rawCode.source,
          notes: isStringArray(rawCode.notes) ? rawCode.notes : [],
        }
      : null;

  const visualizer = parseVisualizer(value.visualizer);

  if (!graph && !code && !visualizer) {
    return {
      ok: false,
      error: "That file has no Lattice data in it — no code, no canvas, and no trace.",
    };
  }

  const rawPreview = isObject(value.preview) ? value.preview : null;
  const preview: GraphPreview | null =
    rawPreview &&
    rawPreview.kind === "svg" &&
    typeof rawPreview.source === "string" &&
    typeof rawPreview.width === "number" &&
    typeof rawPreview.height === "number"
      ? {
          kind: "svg",
          width: rawPreview.width,
          height: rawPreview.height,
          source: rawPreview.source,
        }
      : // Re-rendered rather than trusted-as-absent: the drawing is right
        // here, so a file whose preview was dropped or mangled can still
        // show one, and it will be the correct one.
        graph
        ? renderGraphPreview(graph)
        : visualizer
          ? renderDiagramPreview(diagramAt(visualizer))
          : null;

  return {
    ok: true,
    file: {
      format: LATTICE_MAGIC,
      version: value.version,
      name: typeof value.name === "string" && value.name.trim() ? value.name : "Untitled canvas",
      savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
      code,
      graph,
      visualizer,
      preview,
    },
  };
}

/** The Visualizer section, or null if it is absent or unreadable.
 *
 * A trace with no steps in it counts as absent: it would open onto an
 * empty canvas and there would be nothing to look at, which is not what
 * "this file has a Visualizer graph" ought to mean. */
function parseVisualizer(value: unknown): LatticeVisualizer | null {
  if (!isObject(value)) return null;
  if (!Array.isArray(value.trace) || !value.trace.every(isTraceEvent)) return null;

  const trace = value.trace as TraceEvent[];
  if (!trace.some((event) => !isTruncated(event))) return null;

  return {
    trace,
    stepIndex:
      typeof value.stepIndex === "number" && Number.isFinite(value.stepIndex)
        ? Math.max(0, Math.floor(value.stepIndex))
        : 0,
    stdout: optionalString(value.stdout),
    truncated: value.truncated === true,
    compileCommand: optionalString(value.compileCommand),
    compilerOutput: optionalString(value.compilerOutput),
  };
}
