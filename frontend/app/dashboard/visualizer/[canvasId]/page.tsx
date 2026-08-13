"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "@/components/dashboard/visualizer/InfiniteCanvas";
import FloatingEditor, { type Language } from "@/components/dashboard/visualizer/FloatingEditor";
import TraceControls, { type RunStatus } from "@/components/dashboard/visualizer/TraceControls";
import CanvasNameField from "@/components/dashboard/visualizer/CanvasNameField";
import DiagramView from "@/components/dashboard/visualizer/DiagramView";
import { runTrace } from "@/lib/trace-schema/execute";
import { isTruncated, type StepEvent, type TraceEvent } from "@/lib/trace-schema/types";
import { buildDiagram } from "@/lib/shape-detection";
import { getCanvas, updateCanvas } from "@/lib/canvases";

const HEADER_GAP = 16;
// Debounce for the resume-step PATCH — separate from (and longer than)
// FloatingEditor's own 500ms code-autosave debounce, since scrubbing/
// autoplay can fire step changes far more rapidly than typing does.
const STEP_SAVE_DEBOUNCE_MS = 800;

export default function VisualizerPage() {
  const { getToken } = useAuth();
  const { canvasId } = useParams<{ canvasId: string }>();
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [topInset, setTopInset] = useState(96);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[] | null>(null);
  const [stdout, setStdout] = useState<string | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);
  const [compileCommand, setCompileCommand] = useState<string | undefined>(undefined);
  const [compilerOutput, setCompilerOutput] = useState<string | undefined>(undefined);
  const [stepIndex, setStepIndex] = useState(0);

  // The canvas's own saved code/language, loaded once per canvasId and fed
  // into FloatingEditor as its initial value — FloatingEditor itself is
  // keyed on canvasId below, so this only needs to be read once per canvas,
  // not kept in sync afterward (FloatingEditor owns the live buffer).
  const [initialSource, setInitialSource] = useState<string | undefined>(undefined);
  const [initialLanguage, setInitialLanguage] = useState<Language | undefined>(undefined);
  const [canvasName, setCanvasName] = useState<string | undefined>(undefined);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setInitialSource(undefined);
      setInitialLanguage(undefined);
      setCanvasName(undefined);
      setCanvasError(null);
      setTrace(null);
      setStdout(undefined);
      setTruncated(false);
      setCompileCommand(undefined);
      setCompilerOutput(undefined);
      setStepIndex(0);

      try {
        const token = await getToken();
        const canvas = await getCanvas(canvasId, token);
        if (cancelled) return;
        setInitialSource(canvas.source_code);
        setInitialLanguage(canvas.language);
        setCanvasName(canvas.name);
        if (canvas.trace_data) {
          setTrace(canvas.trace_data);
          setStdout(canvas.stdout ?? undefined);
          setTruncated(canvas.truncated);
          setCompileCommand(canvas.compile_command ?? undefined);
          setCompilerOutput(canvas.compiler_output ?? undefined);
          setStepIndex(canvas.step_index);
        }
      } catch (err) {
        if (!cancelled) {
          setCanvasError(err instanceof Error ? err.message : "Couldn't load this canvas.");
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [canvasId, getToken]);

  // The final "truncated" sentinel (if any) isn't a real step to view —
  // the `truncated` flag above already surfaces that in TraceControls.
  // Memoized on `trace` specifically: `.filter()` builds a new array
  // every call, and without this, TraceControls' autoplay effect (which
  // resets on a "new" `steps` reference) would see a fresh array on
  // every stepIndex-driven re-render and kill itself after one tick.
  const stepEvents = useMemo(
    () => trace?.filter((e): e is StepEvent => !isTruncated(e)) ?? null,
    [trace],
  );
  const stepCount = stepEvents?.length ?? 0;
  const currentStep = stepEvents && stepCount > 0 ? stepEvents[Math.min(stepIndex, stepCount - 1)] : null;
  // Memoized on the step: the layout is pure, and without this it would be
  // recomputed on every unrelated re-render (a zoom tick, an editor drag),
  // and hand the recentring effect below a new object each time.
  const diagram = useMemo(() => (currentStep ? buildDiagram(currentStep) : null), [currentStep]);

  // Left edge of the editor panel, or null while it's minimized (a collapsed
  // pill sits in the top-right corner and shouldn't reserve a column).
  const [editorLeft, setEditorLeft] = useState<number | null>(null);
  const handleEditorGeometry = useCallback(
    ({ left, minimized }: { left: number; minimized: boolean }) =>
      setEditorLeft(minimized ? null : left),
    [],
  );

  /** Frames the current drawing in the gap between the sidebar and the
   * editor. No-op when there's nothing drawn yet. */
  const centerOnDiagram = useCallback(() => {
    const nodes = diagram?.nodes;
    if (!nodes || nodes.length === 0) return false;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const containerWidth = boundsRef.current?.getBoundingClientRect().width ?? 0;
    canvasRef.current?.centerOn(
      { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      {
        // The dashboard layout already pads `main` clear of the collapsed
        // sidebar, so the container's own left edge is the usable boundary.
        right: editorLeft === null ? 0 : Math.max(0, containerWidth - editorLeft),
        top: topInset,
      },
    );
    return true;
  }, [diagram, editorLeft, topInset]);

  // Reset view restores 1:1 zoom, then frames the drawing using the editor's
  // real edge — so it lands in the same place the automatic recentring does,
  // rather than on InfiniteCanvas's own width approximation.
  const handleReset = useCallback(() => {
    canvasRef.current?.resetView();
    centerOnDiagram();
  }, [centerOnDiagram]);

  // Recentre whenever a node appears that wasn't on screen the step before.
  // Keyed on node identity rather than count so a step that simultaneously
  // frees one node and allocates another still counts as new.
  const drawnIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!diagram || diagram.nodes.length === 0) {
      drawnIdsRef.current = new Set();
      return;
    }
    const previous = drawnIdsRef.current;
    const hasNewNode = diagram.nodes.some((n) => !previous.has(n.id));
    drawnIdsRef.current = new Set(diagram.nodes.map((n) => n.id));
    if (hasNewNode) centerOnDiagram();
  }, [diagram, centerOnDiagram]);

  const handleRun = useCallback(async (language: Language, source: string) => {
    setRunStatus("running");
    setRunError(null);
    try {
      const token = await getToken();
      const result = await runTrace(language, source, token, canvasId);
      setTrace(result.trace);
      setStdout(result.stdout);
      setTruncated(result.truncated);
      setCompileCommand(result.compile_command);
      setCompilerOutput(result.compiler_output);
      // A new run always starts review at its own step 0 — mirrors the
      // backend resetting step_index the same way when it records this run
      // onto the canvas (canvas_store::record_run).
      setStepIndex(0);
      setRunStatus("done");
    } catch (err) {
      setTrace(null);
      setCompileCommand(undefined);
      setCompilerOutput(undefined);
      setRunError(err instanceof Error ? err.message : "trace request failed");
      setRunStatus("error");
    }
  }, [getToken, canvasId]);

  // Fired from FloatingEditor's own 500ms-debounced change listener — one
  // more PATCH on the same cadence the editor already autosaves to
  // localStorage at, no extra page-level debouncing needed.
  const handleSourceChange = useCallback((source: string) => {
    getToken()
      .then((token) => updateCanvas(canvasId, { source_code: source }, token))
      .catch(() => {
        // Best-effort — a failed autosave here isn't worth surfacing UI
        // for; the next successful run (or edit) will save again.
      });
  }, [canvasId, getToken]);

  const handleRenameCanvas = useCallback((name: string) => {
    setCanvasName(name);
    getToken()
      .then((token) => updateCanvas(canvasId, { name }, token))
      .catch(() => {
        // Best-effort, same as handleSourceChange — a failed rename PATCH
        // isn't worth surfacing UI for.
      });
  }, [canvasId, getToken]);

  const stepSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleStepChange = useCallback((index: number) => {
    setStepIndex(index);
    if (stepSaveTimeoutRef.current) clearTimeout(stepSaveTimeoutRef.current);
    stepSaveTimeoutRef.current = setTimeout(() => {
      getToken()
        .then((token) => updateCanvas(canvasId, { step_index: index }, token))
        .catch(() => {});
    }, STEP_SAVE_DEBOUNCE_MS);
  }, [canvasId, getToken]);
  useEffect(() => {
    return () => {
      if (stepSaveTimeoutRef.current) clearTimeout(stepSaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setTopInset(el.getBoundingClientRect().height + HEADER_GAP);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boundsRef} className="relative h-full w-full overflow-hidden">
      <InfiniteCanvas ref={canvasRef} onZoomChange={setZoom}>
        {diagram && <DiagramView diagram={diagram} zoom={zoom} />}
      </InfiniteCanvas>

      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-end justify-between gap-4 p-1"
      >
        <div className="shifts-with-sidebar pointer-events-none pl-8">
          <span aria-hidden="true" className="invisible block font-mono text-[13px] uppercase tracking-[0.2em]">
            Visualizer
          </span>
          <div className="mt-2 flex flex-wrap items-end gap-8">
            <span
              className="block font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl"
              style={{ filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.55))" }}
            >
              Visualizer
            </span>
            <div className="pointer-events-auto flex items-center gap-3 pb-1">
              <TraceControls
                status={runStatus}
                error={runError ?? canvasError}
                stepIndex={stepIndex}
                steps={stepEvents ?? []}
                onStepChange={handleStepChange}
                stdout={stdout}
                truncated={truncated}
                compileCommand={compileCommand}
                compilerOutput={compilerOutput}
              />
              <CanvasNameField name={canvasName} onRename={handleRenameCanvas} />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto mb-2 flex items-center gap-3">
          <span className="matte hidden rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] lg:inline-block">
            Scroll to zoom · Drag to pan
          </span>
          <div className="matte flex items-center gap-3 rounded-full px-4 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
              Zoom
            </span>
            <span className="w-10 shrink-0 font-mono text-[12px] font-medium text-[var(--text-primary)]">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="matte rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Reset view
          </button>
        </div>
      </div>

      <FloatingEditor
        key={canvasId}
        boundsRef={boundsRef}
        topInset={topInset}
        onRun={handleRun}
        running={runStatus === "running"}
        onGeometryChange={handleEditorGeometry}
        // Suppressed while a run is in flight: the previous trace's lines
        // still describe the previous source, so holding the old highlight
        // over freshly-edited code would point at the wrong statement.
        activeLine={runStatus === "running" ? null : (currentStep?.line ?? null)}
        initialSource={initialSource}
        initialLanguage={initialLanguage}
        onSourceChange={handleSourceChange}
      />
    </div>
  );
}
