/**
 * The `.lattice` file format.
 *
 * One file holding a whole piece of Code-Canvas work: the node graph, the
 * code that graph last generated, and a picture of it. The point is that
 * all three travel together — a graph without its code cannot be read by
 * anything but this app, and code without its graph cannot be edited back
 * into blocks. Bundling the preview as well means the file says what it
 * is before anything opens it.
 *
 * ## Why JSON
 *
 * The graph, the code and the preview are already text, and every other
 * payload in this project crosses the wire as JSON. A container format
 * (zip, tar) would buy compression this does not need and cost the two
 * things plain JSON gives for free: it diffs in git, and a person can
 * open it in an editor and see what is in their file. The preview is the
 * only bulky member and it is SVG, which compresses well in transit and
 * stays legible at rest.
 *
 * ## What is deliberately not in here
 *
 * The **trace** — `trace_data` on a Visualizer canvas. A trace is an
 * output: it is reproducible by running the code, it is by far the
 * largest thing in a workspace (§6.3 caps a run at 5000 steps), and it
 * goes stale the instant either the code or the graph is edited, which
 * makes it exactly the wrong thing to freeze into a file whose purpose is
 * to be edited elsewhere and brought back.
 *
 * ## Versioning
 *
 * `version` is the schema number, bumped only for a change a previous
 * reader could not cope with. Readers must accept unknown extra keys and
 * refuse a version they do not know, which is why `parseLatticeFile`
 * checks the number before it looks at anything else.
 */

import type { Language } from "@/components/dashboard/visualizer/FloatingEditor";
import { parseGraph, type CanvasGraph } from "@/lib/code-canvas/graph";
import { renderGraphPreview, type GraphPreview } from "./preview";

/** Current schema version. */
export const LATTICE_VERSION = 1;

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
   * graph rather than silently believing it is complete. */
  notes: string[];
};

export type LatticeFile = {
  format: typeof LATTICE_MAGIC;
  version: number;
  /** The graph's name, used to suggest a filename on export. */
  name: string;
  /** When the file was written, ISO 8601. */
  savedAt: string;
  code: LatticeCode;
  graph: CanvasGraph;
  preview: GraphPreview;
};

/**
 * Builds a file from the pieces the Code-Canvas already has in hand.
 *
 * The preview is rendered here rather than passed in, so there is exactly
 * one way a `.lattice` preview can come to exist and it cannot disagree
 * with the graph beside it in the same file.
 */
export function buildLatticeFile(input: {
  name: string;
  graph: CanvasGraph;
  code: LatticeCode;
  /** Injectable only so tests can pin it; defaults to now. */
  savedAt?: Date;
}): LatticeFile {
  return {
    format: LATTICE_MAGIC,
    version: LATTICE_VERSION,
    name: input.name,
    savedAt: (input.savedAt ?? new Date()).toISOString(),
    code: input.code,
    graph: input.graph,
    preview: renderGraphPreview(input.graph),
  };
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

/**
 * Reads a `.lattice` document.
 *
 * Written as a total function returning a reason rather than one that
 * throws, because every caller is a file the user picked and every
 * failure is something they need told: the wrong file, a newer version, a
 * truncated download. Each check below corresponds to a message worth
 * showing.
 *
 * Unknown extra keys are preserved by being ignored — a file written by a
 * later version that only *added* fields still opens here, which is the
 * whole reason `version` is checked for equality against known values
 * rather than assumed.
 */
export function parseLatticeFile(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON — it may be truncated or not a .lattice file." };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "That file doesn't contain a Lattice document." };
  }

  const value = data as Record<string, unknown>;

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

  const graph = parseGraph(value.graph);
  if (!graph) {
    return { ok: false, error: "That file's node graph is missing or unreadable." };
  }

  const rawCode = (value.code ?? {}) as Record<string, unknown>;
  if (typeof rawCode.source !== "string") {
    return { ok: false, error: "That file doesn't contain any saved code." };
  }

  // Everything below this point is recoverable: a file with a readable
  // graph and readable code is worth opening even if its metadata is
  // patchy, so the remaining fields fall back rather than failing.
  const code: LatticeCode = {
    language: isLanguage(rawCode.language) ? rawCode.language : "cpp",
    source: rawCode.source,
    notes: isStringArray(rawCode.notes) ? rawCode.notes : [],
  };

  const rawPreview = (value.preview ?? {}) as Record<string, unknown>;
  const preview: GraphPreview =
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
      : // Re-rendered rather than trusted-as-absent: the graph is right
        // here, so a file whose preview was dropped or mangled can still
        // show one, and it will be the correct one.
        renderGraphPreview(graph);

  return {
    ok: true,
    file: {
      format: LATTICE_MAGIC,
      version: value.version,
      name: typeof value.name === "string" && value.name.trim() ? value.name : "Untitled canvas",
      savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
      code,
      graph,
      preview,
    },
  };
}
