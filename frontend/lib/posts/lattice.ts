/**
 * A post's attachments, as `.lattice` files.
 *
 * Built here rather than stored on the post, because a `.lattice` is a
 * derived thing — graph, code and rendered preview all come out of what
 * the attachment already carries (see lib/lattice-file/format.ts). Storing
 * the file beside them would create two copies that could disagree, and
 * the one a reader downloads would be the stale one.
 *
 * Built on click rather than at render, too. Six posts on the feed is a
 * pass of preview rendering per attachment for files nobody has asked for
 * yet; the work is milliseconds but it is milliseconds during the scroll.
 *
 * One thing changed when posts learned to carry several canvases: the code
 * in the file is the attachment's own `code`, not `generateCpp(graph)`
 * run afresh. The drawing on a post is a recording of one particular run,
 * so the file has to hand over the source that run executed — regenerating
 * it would be handing over a program the picture does not describe.
 */

import {
  LATTICE_MIME,
  buildLatticeFile,
  serializeLatticeFile,
  suggestFileName,
  type LatticeFile,
} from "@/lib/lattice-file/format";
import { createZip, uniqueNames } from "@/lib/lattice-file/zip";
import type { CanvasAttachment, Post } from "./types";

/** The file for one attachment, as Code-Canvas or the Visualizer would
 * have exported it. */
export function latticeFileForAttachment(canvas: CanvasAttachment): LatticeFile {
  return buildLatticeFile({
    name: canvas.name,
    graph: canvas.graph,
    code: {
      // Not `canvas.language`. That is the language the *trace* was taken
      // in; codegen emits C++ and nothing else today, so labelling the
      // payload with anything else would make the file lie about its own
      // contents to whatever opens it next.
      language: "cpp",
      source: canvas.code,
      notes: [],
    },
  });
}

/** What one attachment's download will be called. Shown on the control, so
 * a reader knows what is about to land in their downloads folder. */
export function latticeFileName(canvas: CanvasAttachment): string {
  return suggestFileName(canvas.name);
}

/** What the whole-post download will be called. */
export function archiveFileName(post: Post): string {
  const stem = post.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${stem || "lattice-post"}.zip`;
}

/**
 * Hands a blob to the browser.
 *
 * An object URL, a synthetic click, and an immediate revoke — the click is
 * synchronous, so the blob has already been claimed by the time the URL is
 * let go.
 */
function download(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return name;
}

/** Saves the one attachment the carousel is currently showing. */
export function downloadAttachment(canvas: CanvasAttachment): string {
  const name = latticeFileName(canvas);
  const blob = new Blob([serializeLatticeFile(latticeFileForAttachment(canvas))], {
    type: LATTICE_MIME,
  });
  return download(blob, name);
}

/**
 * Saves every attachment on the post, as one archive.
 *
 * An archive rather than a download per file because a browser drops all
 * but the first one or two downloads started from a single gesture — "save
 * everything" has to arrive as one thing or it silently arrives as some of
 * it. A post with exactly one attachment skips the archive and saves the
 * file directly: wrapping a lone file in a zip is a step the reader then
 * has to undo.
 */
export function downloadAllAttachments(post: Post): string {
  if (post.canvases.length === 1) return downloadAttachment(post.canvases[0]);

  const names = uniqueNames(post.canvases.map(latticeFileName));
  const zip = createZip(
    post.canvases.map((canvas, i) => ({
      name: names[i],
      content: serializeLatticeFile(latticeFileForAttachment(canvas)),
    })),
  );
  return download(zip, archiveFileName(post));
}
