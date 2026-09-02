"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CanvasPreview from "./CanvasPreview";
import { getCanvas, listCanvases } from "@/lib/canvases";
import { getCodeCanvas, listCodeCanvases } from "@/lib/code-canvas/api";
import {
  AttachError,
  graphAttachable,
  toAttachment,
  traceWorkspace,
  type Attachable,
  type TraceableStep,
} from "@/lib/posts/attach";
import { usePostActions } from "@/lib/posts/use-posts";
import type { CanvasAttachment } from "@/lib/posts/types";
import { relativeTime } from "@/lib/relative-time";

/**
 * Writing a post.
 *
 * The shape of this screen follows from one rule: a post on this feed is a
 * trace somebody wants to show, so it cannot be published without a
 * drawing on it. That is why the attachment picker is not an afterthought
 * below the prose — it is half the dialog, and Publish stays disabled
 * until something is on it.
 *
 * Attaching is where the work is. Nothing stores traces (see
 * `lib/posts/attach`), so choosing a workspace runs its code, and the
 * author then picks which step of that run the post shows. Each row does
 * that independently and reports its own failure, because one canvas that
 * will not compile should not take the other three down with it.
 *
 * There is no file upload, deliberately. Everything attachable is
 * something the author already made here, which means every post links
 * back to a real workspace rather than to a file that came from nowhere.
 */

/** A workspace in the picker, and whatever has happened to it so far. */
type Row = {
  item: Attachable;
  state: "idle" | "running" | "ready" | "failed";
  steps: TraceableStep[];
  /** Which step of `steps` the post will show. */
  stepIndex: number;
  error: string | null;
};

const MAX_CANVASES = 8;

export default function PostComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { getToken } = useAuth();
  const actions = usePostActions();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Both workspace kinds, listed together and newest first — the author
  // thinks in terms of "the thing I was just working on", not in terms of
  // which of the two editors made it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = await getToken();
        const [canvases, graphs] = await Promise.all([
          listCanvases(token),
          listCodeCanvases(token),
        ]);
        if (cancelled) return;

        const items: Attachable[] = [
          ...graphs.map((graph) => ({
            id: graph.id,
            source: "code-canvas" as const,
            name: graph.name,
            language: "cpp" as const,
            updatedAt: graph.updated_at,
            // Filled in when the row is selected — listing does not carry
            // the graph, and fetching every one of them to render a list
            // of names would be a download per row for nothing.
            graph: null,
            code: "",
          })),
          ...canvases.map((canvas) => ({
            id: canvas.id,
            source: "canvas" as const,
            name: canvas.name,
            language: canvas.language,
            updatedAt: canvas.updated_at,
            graph: null,
            code: "",
          })),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        setRows(items.map((item) => ({ item, state: "idle", steps: [], stepIndex: 0, error: null })));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load your workspaces.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  const patch = useCallback((id: string, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.item.id === id ? { ...row, ...change } : row)));
  }, []);

  const attached = useMemo(() => rows.filter((row) => row.state === "ready"), [rows]);

  /** Selecting a row fetches what the listing left out, runs it, and keeps
   * every step that draws something. Deselecting is immediate — there is
   * nothing to undo but the choice itself. */
  const toggle = useCallback(
    async (row: Row) => {
      if (row.state === "running") return;
      if (row.state === "ready") {
        patch(row.item.id, { state: "idle", steps: [], stepIndex: 0, error: null });
        return;
      }
      if (attached.length >= MAX_CANVASES) {
        patch(row.item.id, { error: `A post can carry at most ${MAX_CANVASES} canvases.` });
        return;
      }

      patch(row.item.id, { state: "running", error: null });
      try {
        const token = await getToken();
        const item = await hydrate(row.item, token);
        const steps = await traceWorkspace(item, token);
        // The last drawable step is the structure at its most built —
        // almost always the one worth showing, and a better default than
        // step one, which is usually a single node.
        patch(row.item.id, {
          item,
          state: "ready",
          steps,
          stepIndex: steps.length - 1,
          error: null,
        });
      } catch (err) {
        patch(row.item.id, {
          state: "failed",
          error:
            err instanceof AttachError
              ? err.message
              : err instanceof Error
                ? `Couldn't trace "${row.item.name}": ${err.message}`
                : "Couldn't trace that workspace.",
        });
      }
    },
    [attached.length, getToken, patch],
  );

  const canPublish =
    title.trim().length > 0 && body.trim().length > 0 && attached.length > 0 && !publishing;

  const close = useCallback(() => {
    setTitle("");
    setBody("");
    setTags("");
    setRows([]);
    setPublishError(null);
    onClose();
  }, [onClose]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      // Blank lines separate paragraphs, the way anybody writing prose in
      // a plain textarea already expects.
      const paragraphs = body
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

      const canvases: CanvasAttachment[] = attached.map((row) =>
        toAttachment(row.item, row.steps[row.stepIndex]),
      );

      await actions.publish({
        title: title.trim(),
        body: paragraphs,
        tags: tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        canvases,
      });
      close();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Couldn't publish that post.");
    } finally {
      setPublishing(false);
    }
  }, [actions, attached, body, tags, title, close]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (typeof document === "undefined") return null;

  if (!open) return null;

  return createPortal(
    // Plain elements and a CSS keyframe — no `motion`, no
    // `AnimatePresence`.
    //
    // Not because either is broken: `AnimatePresence` unmounts an exiting
    // child only once the exit animation finishes, which is correct, and
    // it is what the rest of the app uses. But it does make "is this modal
    // gone?" a question about an animation rather than about state, and an
    // animation can decline to run — a backgrounded tab freezes rAF and
    // CSS animations alike, so a dialog closed while the tab is hidden
    // stays mounted until the tab is looked at again.
    //
    // A keyframe on a plain element inverts that: the element is present
    // because it is rendered and gone because it is not, and the animation
    // is decoration over the top. `LatticeFileControls`' import dialog is
    // built the same way, for the same reason.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6"
      onClick={close}
    >
      <div
        className="glass dialog-in my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-bar relative z-10 flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3.5">
          <h2 className="font-serif text-[16px] font-bold text-[var(--text-primary)]">
            New post
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {attached.length} attached
          </span>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What did you work out?"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Body" hint="Leave a blank line between paragraphs">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="What the trace showed you, and what it meant."
              className={`${INPUT_CLASS} resize-y leading-6`}
            />
          </Field>

          <Field label="Tags" hint="Comma separated">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="linked-list, pointers"
              className={INPUT_CLASS}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Canvases <span className="text-[var(--accent-secondary)]">required</span>
            </span>
            <p className="font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
              Pick from what you&rsquo;ve built. Each one runs so the post can show a real
              step of it &mdash; choose which step below.
            </p>

            {loading ? (
              <Notice>Loading your canvases and graphs&hellip;</Notice>
            ) : loadError ? (
              <Notice tone="error">{loadError}</Notice>
            ) : rows.length === 0 ? (
              <Notice>
                Nothing to attach yet. Build something in Code-Canvas or the Visualizer
                first &mdash; a post here is a trace, so it needs one.
              </Notice>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rows.map((row) => (
                  <WorkspaceRow
                    key={`${row.item.source}-${row.item.id}`}
                    row={row}
                    onToggle={() => toggle(row)}
                    onStep={(stepIndex) => patch(row.item.id, { stepIndex })}
                  />
                ))}
              </ul>
            )}
          </div>

          {publishError && <Notice tone="error">{publishError}</Notice>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            className="rail-pill glass-flat inline-flex rounded-full px-3.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            title={
              attached.length === 0
                ? "Attach at least one canvas to publish"
                : "Publish this post"
            }
            className="rail-pill inline-flex rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Fetches the parts the listing left out — the graph, or the canvas's
 * source — and compiles a graph to the C++ that will actually be run. */
async function hydrate(item: Attachable, token: string | null): Promise<Attachable> {
  if (item.source === "code-canvas") {
    const graph = await getCodeCanvas(item.id, token);
    return graphAttachable(item.id, graph.name, graph.graph, graph.updated_at);
  }

  const canvas = await getCanvas(item.id, token);
  // A canvas generated from a graph keeps a link to it, and the blocks are
  // worth carrying: a reader who downloads the `.lattice` gets something
  // they can edit rather than only text they can read.
  let graph = null;
  if (canvas.code_canvas_id) {
    try {
      graph = (await getCodeCanvas(canvas.code_canvas_id, token)).graph;
    } catch {
      // The graph was deleted after generating this canvas. The canvas is
      // still perfectly postable; it just has no blocks behind it.
    }
  }
  return {
    id: canvas.id,
    source: "canvas",
    name: canvas.name,
    language: canvas.language,
    updatedAt: canvas.updated_at,
    graph,
    code: canvas.source_code,
  };
}

const INPUT_CLASS =
  "w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg-elevated)] px-3 py-2 font-serif text-[14px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] placeholder:opacity-60 focus:border-[var(--accent-secondary)]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
        {label}
        {hint && <span className="opacity-60">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p
      className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 font-serif text-[13px] leading-6 text-[var(--text-secondary)]"
      style={tone === "error" ? { borderColor: "var(--accent-secondary)" } : undefined}
    >
      {children}
    </p>
  );
}

/**
 * One workspace, and the step picker it grows once it has been traced.
 *
 * The preview is the point of the picker: the author is choosing which
 * frame of a run the feed will show, and the only way to choose it is to
 * see it.
 */
function WorkspaceRow({
  row,
  onToggle,
  onStep,
}: {
  row: Row;
  onToggle: () => void;
  onStep: (index: number) => void;
}) {
  const ready = row.state === "ready";
  const step = ready ? row.steps[row.stepIndex] : null;

  return (
    <li
      className="rounded-xl border px-3 py-2.5 transition-colors"
      style={{
        borderColor: ready ? "var(--accent-secondary)" : "var(--hairline)",
        background: ready ? "color-mix(in srgb, var(--accent-secondary) 6%, transparent)" : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={row.state === "running"}
          aria-pressed={ready}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50"
          style={{
            borderColor: ready ? "var(--accent-secondary)" : "var(--hairline)",
            background: ready ? "var(--accent-secondary)" : "transparent",
          }}
        >
          {ready && (
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="var(--bg-base)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8.5l3.5 3.5L13 4.5" />
            </svg>
          )}
        </button>

        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 flex-col items-start text-left">
          <span className="w-full truncate font-mono text-[12px] font-medium text-[var(--text-primary)]">
            {row.item.name}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            {row.item.source === "code-canvas" ? "Graph" : "Canvas"} · {relativeTime(row.item.updatedAt)}
            {row.state === "running" && " · running…"}
          </span>
        </button>
      </div>

      {row.error && (
        <p className="mt-2 font-serif text-[12px] leading-5 text-[var(--accent-secondary)]">
          {row.error}
        </p>
      )}

      {ready && step && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="h-28 overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--bg-elevated)]">
            <CanvasPreview diagram={step.diagram} className="h-full w-full" />
          </div>
          {row.steps.length > 1 && (
            <label className="flex items-center gap-2.5">
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
                Step
              </span>
              <input
                type="range"
                min={0}
                max={row.steps.length - 1}
                value={row.stepIndex}
                onChange={(e) => onStep(Number(e.target.value))}
                className="h-1 min-w-0 flex-1 accent-[var(--accent-secondary)]"
                aria-label={`Which step of "${row.item.name}" to show`}
              />
              <span className="shrink-0 font-mono text-[9px] tabular-nums text-[var(--text-secondary)]">
                {row.stepIndex + 1}/{row.steps.length}
              </span>
            </label>
          )}
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
            {step.label}
          </span>
        </div>
      )}
    </li>
  );
}
