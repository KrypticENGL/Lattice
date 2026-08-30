/**
 * A post's attachment: the `.lattice` file for the canvas it is about.
 *
 * Built here rather than stored on the post, because a `.lattice` is a
 * derived thing — graph, generated code and rendered preview, all three of
 * which come out of the graph (see lib/lattice-file/format.ts). Storing the
 * file beside the graph that produces it would create two copies that could
 * disagree, and the one a reader downloads would be the stale one.
 *
 * Built on click rather than at render, too. Six posts on the feed is six
 * SVG previews and six passes of codegen for files nobody has asked for
 * yet; the work is milliseconds but it is milliseconds during the scroll.
 */

import { generateCpp } from "@/lib/code-canvas/codegen";
import {
  LATTICE_MIME,
  buildLatticeFile,
  serializeLatticeFile,
  suggestFileName,
  type LatticeFile,
} from "@/lib/lattice-file/format";
import type { Post } from "./types";

/** The file for a post's canvas, exactly as Code-Canvas would have exported
 * it: the same graph, the same generated code, the same preview. */
export function latticeFileForPost(post: Post): LatticeFile {
  const generated = generateCpp(post.canvas.graph);
  return buildLatticeFile({
    name: post.canvas.name,
    graph: post.canvas.graph,
    code: {
      // Not `post.canvas.language`. That is the language the *trace* was
      // taken in; codegen emits C++ and nothing else today, so labelling
      // the payload with anything the post happened to say would make the
      // file lie about its own contents to whatever opens it next.
      language: "cpp",
      source: generated.code,
      notes: generated.notes,
    },
  });
}

/** What the download will be called. Shown on the control, so a reader
 * knows what is about to land in their downloads folder. */
export function latticeFileName(post: Post): string {
  return suggestFileName(post.canvas.name);
}

/**
 * Hands the file to the browser.
 *
 * Same dance as `LatticeFileControls`' export: an object URL, a synthetic
 * click, and an immediate revoke — the click is synchronous, so the blob
 * has already been claimed by the time the URL is let go.
 */
export function downloadLatticeFile(post: Post): string {
  const name = latticeFileName(post);
  const blob = new Blob([serializeLatticeFile(latticeFileForPost(post))], {
    type: LATTICE_MIME,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return name;
}
