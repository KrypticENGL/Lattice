"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LATTICE_EXTENSION,
  LATTICE_MIME,
  buildLatticeFile,
  parseLatticeFile,
  serializeLatticeFile,
  suggestFileName,
  type LatticeCode,
  type LatticeFile,
} from "@/lib/lattice-file/format";
import type { CanvasGraph } from "@/lib/code-canvas/graph";

/**
 * Save this canvas to a `.lattice` file, and open one back.
 *
 * Export is unremarkable. Import is not: dropping a file's graph onto the
 * canvas throws away whatever is currently on it, which is destructive and
 * silent, so the file is parsed and *shown* — its own preview, its name,
 * what it contains — before anything is replaced. The preview inside the
 * file is exactly what makes that confirmation worth having; without it
 * the reader would be agreeing to a filename.
 */

/** Refuses a file too big to be one of ours. A `.lattice` is a graph, a
 * page of code and an SVG; anything past this is either not our file or
 * one we should not be reading into a string on the main thread. */
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/** Renders an SVG that came out of a file the user chose.
 *
 * Deliberately an `<img>` with a data URI rather than inline markup. The
 * preview is untrusted content — anyone can hand-edit a `.lattice` and put
 * whatever they like in `preview.source` — and SVG inlined into the
 * document can carry script and same-origin references. Inside `<img>` it
 * is treated as an image: no script, no external fetches, no access to
 * this page. It costs nothing here because the preview is a picture.
 */
function PreviewImage({ source, alt }: { source: string; alt: string }) {
  // A data: URI of in-memory SVG. next/image optimises fetched assets and
  // cannot take one of these, so the bare element is the only option.
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`}
      alt={alt}
      className="h-full w-full object-contain"
    />
  );
}

function PillButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rail-pill glass-flat inline-flex rounded-full px-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function LatticeFileControls({
  name,
  graph,
  code,
  onImport,
  onNotify,
}: {
  name: string;
  graph: CanvasGraph;
  code: LatticeCode;
  /** Hands the caller the parsed file once the reader has confirmed the
   * replacement. Naming the whole file rather than just the graph is
   * deliberate — the code and the name travel with it. */
  onImport: (file: LatticeFile) => void;
  onNotify: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<LatticeFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    const file = buildLatticeFile({ name, graph, code });
    const blob = new Blob([serializeLatticeFile(file)], { type: LATTICE_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestFileName(name);
    a.click();
    // The object URL pins the blob in memory until it is revoked, and the
    // click above is synchronous, so it is safe to let go immediately.
    URL.revokeObjectURL(url);
    onNotify(`Saved ${suggestFileName(name)}`);
  }, [name, graph, code, onNotify]);

  const handleOpenClick = useCallback(() => {
    setError(null);
    // Cleared on open rather than after the read: picking the same file
    // twice in a row fires no change event unless the value is reset, and
    // doing it here covers a cancelled picker too.
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      setError(`${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB — too large to be a .lattice file.`);
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError(`Couldn't read ${file.name}.`);
      return;
    }

    const result = parseLatticeFile(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPending(result.file);
  }, []);

  const confirm = useCallback(() => {
    if (!pending) return;
    onImport(pending);
    setPending(null);
    onNotify(`Opened ${pending.name}`);
  }, [pending, onImport, onNotify]);

  return (
    <>
      <PillButton onClick={handleExport} title="Save this canvas as a .lattice file">
        Export
      </PillButton>
      <PillButton onClick={handleOpenClick} title="Open a .lattice file">
        Open
      </PillButton>

      <input
        ref={inputRef}
        type="file"
        accept={`${LATTICE_EXTENSION},application/json`}
        onChange={handleFileChange}
        className="hidden"
      />

      <ImportDialog
        file={pending}
        error={error}
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
        onConfirm={confirm}
      />
    </>
  );
}

function ImportDialog({
  file,
  error,
  onCancel,
  onConfirm,
}: {
  file: LatticeFile | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const open = file !== null || error !== null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  // SSR has no `document`. Also: a portal straight to <body> rather than
  // z-index inside the header — the Code-Canvas header is its own stacking
  // context, so nothing rendered inside it can come out above the code
  // pane no matter what number it picks.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            className="glass flex w-full max-w-lg flex-col overflow-hidden rounded-2xl"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3.5">
              <h2 className="font-serif text-[16px] font-bold text-[var(--text-primary)]">
                {error ? "Couldn't open that file" : "Open this canvas?"}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                {LATTICE_EXTENSION}
              </span>
            </div>

            {error ? (
              <p className="px-5 py-5 font-serif text-[14px] leading-6 text-[var(--text-secondary)]">
                {error}
              </p>
            ) : (
              file && (
                <div className="flex flex-col gap-3 p-5">
                  <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--bg-base)]">
                    <div className="aspect-[16/9] w-full">
                      <PreviewImage source={file.preview.source} alt={`Preview of ${file.name}`} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">
                      {file.name}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                      {file.graph.nodes.length} blocks · {file.graph.edges.length} wires ·{" "}
                      {file.code.source.split("\n").length} lines
                    </span>
                  </div>

                  <p className="font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
                    This replaces everything currently on the canvas. Export first if you
                    want to keep it.
                  </p>
                </div>
              )
            )}

            <div className="flex justify-end gap-2 border-t border-[var(--hairline)] px-5 py-3.5">
              <button
                type="button"
                onClick={onCancel}
                className="rail-pill glass-flat inline-flex rounded-full px-3.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
              >
                {error ? "Close" : "Cancel"}
              </button>
              {!error && (
                <button
                  type="button"
                  onClick={onConfirm}
                  className="rail-pill inline-flex rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
                >
                  Replace canvas
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
