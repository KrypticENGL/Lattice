"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "@/components/dashboard/visualizer/InfiniteCanvas";
import EdgeStyleControl from "@/components/dashboard/EdgeStyleControl";
import { useEdgeStyle } from "@/lib/use-edge-style";
import FloatingEditor, { type Language } from "@/components/dashboard/visualizer/FloatingEditor";
import TraceControls, { type RunStatus } from "@/components/dashboard/visualizer/TraceControls";
import CanvasNameField from "@/components/dashboard/CanvasNameField";
import WorkspaceGate from "@/components/dashboard/WorkspaceGate";
import DiagramView from "@/components/dashboard/visualizer/DiagramView";
import LatticeFileControls from "@/components/dashboard/LatticeFileControls";
import type { LatticeCode, LatticeFile, LatticeVisualizer } from "@/lib/lattice-file/format";
import { runTrace } from "@/lib/trace-schema/execute";
import { isTruncated, type StepEvent, type TraceEvent } from "@/lib/trace-schema/types";
import { buildDiagram } from "@/lib/shape-detection";
import { getCanvas, updateCanvas } from "@/lib/canvases";

const HEADER_GAP = 16;
// Debounce for the resume-step PATCH — separate from (and longer than)
// FloatingEditor's own 500ms code-autosave debounce, since scrubbing/
// autoplay can fire step changes far more rapidly than typing does.
const STEP_SAVE_DEBOUNCE_MS = 800;
/** What this page needs to find in a `.lattice` file, most important
 * first. The drawing is what the Visualizer is for, so a file without one
 * is reported as missing that rather than as missing its code — and the
 * code is required too, because a trace is a recording of a program and
 * opening one without it would put the highlight on lines that are not
 * there. Hoisted to keep one identity across renders. */
const VISUALIZER_REQUIRES = ["visualizer", "code"] as const;

export default function VisualizerPage() {
  const { getToken } = useAuth();
  const { canvasId } = useParams<{ canvasId: string }>();
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [topInset, setTopInset] = useState(96);
  /** How edges are routed. A view preference about this browser, not
   * anything about the traced structure, so it lives in browser storage
   * rather than on the saved canvas. */
  const [edgeStyle, handleEdgeStyle] = useEdgeStyle();

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
  /** The buffer as the page last heard about it, and the language it is
   * set to. FloatingEditor owns both — this is the copy `Export` writes,
   * and it arrives on the editor's own 500ms debounce, so it lags typing
   * by exactly as much as the canvas autosave does. */
  const [liveSource, setLiveSource] = useState<string | undefined>(undefined);
  const [liveLanguage, setLiveLanguage] = useState<Language>("cpp");
  /** Bumped when a whole workspace is swapped in from a `.lattice` file.
   * Monaco reads its contents from `defaultValue` once, at mount, so a
   * new buffer only lands by remounting the editor — the same trick the
   * `canvasId` key already plays when you switch canvases. */
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [canvasName, setCanvasName] = useState<string | undefined>(undefined);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  /** Transient confirmations — a file saved, a file opened. Same banner
   * Code-Canvas uses, in the same place, for the same reason: these are
   * things that happened, not things to decide. */
  const [toast, setToast] = useState<string | null>(null);
  /** Id of the Code-Canvas graph this canvas was generated from, or null
   * for a hand-written one. Non-null makes the editor read-only: the code
   * belongs to the graph, and the server rejects edits to it (409). */
  const [generatedFrom, setGeneratedFrom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setInitialSource(undefined);
      setInitialLanguage(undefined);
      setLiveSource(undefined);
      setCanvasName(undefined);
      setCanvasError(null);
      setGeneratedFrom(null);
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
        setLiveSource(canvas.source_code);
        setLiveLanguage(canvas.language);
        setCanvasName(canvas.name);
        setGeneratedFrom(canvas.code_canvas_id);
        // Only the code comes back — a canvas no longer carries its last
        // trace, so the diagram starts empty until you press Run. The
        // resets above already put every trace-derived piece of state in
        // that state.
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

  // Left edge of the editor panel. Three distinct states, and the
  // difference between the first two is the whole point: `undefined` is
  // "the panel hasn't reported in yet", `null` is "it has, and it's
  // minimized" (a collapsed pill sits in the top-right corner and
  // shouldn't reserve a column), a number is its real edge.
  const [editorLeft, setEditorLeft] = useState<number | null | undefined>(undefined);
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
    // Nothing known about the editor yet, so there is no right-hand edge to
    // frame against. That is the normal case on load rather than an edge
    // one: the editor only mounts once the canvas's code has arrived, and
    // that is the same commit that restores a saved trace — so the first
    // diagram is on screen before the panel has measured itself. Centring
    // now would use the container's bare midpoint, which is squarely under
    // the panel that is about to appear. Hold the camera still instead and
    // let the effect below frame it once the real edge is known.
    if (editorLeft === undefined) return false;
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

  // The opening framing, run as soon as there is both something to frame
  // and an editor edge to frame it against — whichever of the two arrives
  // last. The per-node effect below can't do this job on its own: it fires
  // once per *new* node, so a trace restored with the canvas gets its one
  // chance while `editorLeft` is still unknown and is never revisited.
  const framedRef = useRef(false);
  useEffect(() => {
    if (!framedRef.current && centerOnDiagram()) framedRef.current = true;
  }, [centerOnDiagram]);

  // Recentre whenever a node appears that wasn't on screen the step before.
  // Keyed on node identity rather than count so a step that simultaneously
  // frees one node and allocates another still counts as new.
  const drawnIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!diagram || diagram.nodes.length === 0) {
      drawnIdsRef.current = new Set();
      // Switching canvases clears the trace before the next one loads;
      // the drawing that follows is a new one and wants framing again.
      framedRef.current = false;
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
      const result = await runTrace(language, source, token);
      setTrace(result.trace);
      setStdout(result.stdout);
      setTruncated(result.truncated);
      setCompileCommand(result.compile_command);
      setCompilerOutput(result.compiler_output);
      // A new run always starts review at its own step 0. The stored
      // step_index follows on the next save; nothing persists the trace
      // itself, so this state is the only copy of it.
      setStepIndex(0);
      setRunStatus("done");
    } catch (err) {
      setTrace(null);
      setCompileCommand(undefined);
      setCompilerOutput(undefined);
      setRunError(err instanceof Error ? err.message : "trace request failed");
      setRunStatus("error");
    }
  }, [getToken]);

  // Fired from FloatingEditor's own 500ms-debounced change listener — one
  // more PATCH on the same cadence the editor already autosaves to
  // localStorage at, no extra page-level debouncing needed.
  const handleSourceChange = useCallback((source: string) => {
    // Tracked before the guard below, not after it: a generated canvas
    // cannot be *saved*, but its code is still what an export should
    // write, and the buffer can change under a run even when it can't.
    setLiveSource(source);
    // A generated canvas has nothing to autosave — its source belongs to
    // the graph, and the PATCH would come back 409. FloatingEditor already
    // suppresses this in read-only mode; this is the second lock, for the
    // window before the canvas has finished loading.
    if (generatedFrom) return;
    getToken()
      .then((token) => updateCanvas(canvasId, { source_code: source }, token))
      .catch(() => {
        // Best-effort — a failed autosave here isn't worth surfacing UI
        // for; the next successful run (or edit) will save again.
      });
  }, [canvasId, getToken, generatedFrom]);

  const handleRenameCanvas = useCallback((name: string) => {
    setCanvasName(name);
    getToken()
      .then((token) => updateCanvas(canvasId, { name }, token))
      .catch(() => {
        // Best-effort, same as handleSourceChange — a failed rename PATCH
        // isn't worth surfacing UI for.
      });
  }, [canvasId, getToken]);

  /* -------------------------------------------------------------- */
  /* .lattice files                                                  */
  /* -------------------------------------------------------------- */

  /** The code half of what `Export` writes. Null until the canvas has
   * loaded, which is what disables the button until there is something
   * real to save. `notes` is empty by definition: those are codegen's
   * warnings about a graph, and this buffer was written by a person. */
  const latticeCode = useMemo<LatticeCode | null>(
    () =>
      liveSource === undefined
        ? null
        : { language: liveLanguage, source: liveSource, notes: [] },
    [liveSource, liveLanguage],
  );

  /** The Visualizer half: the run, and the step being looked at. Null with
   * no trace — a file claiming a Visualizer graph and carrying an empty
   * one would be worse than a file that plainly has none. */
  const visualizerData = useMemo<LatticeVisualizer | null>(
    () =>
      trace && trace.length > 0
        ? {
            trace,
            stepIndex,
            stdout: stdout ?? null,
            truncated,
            compileCommand: compileCommand ?? null,
            compilerOutput: compilerOutput ?? null,
          }
        : null,
    [trace, stepIndex, stdout, truncated, compileCommand, compilerOutput],
  );

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2600);
  }, []);

  const handleImportLattice = useCallback(
    (file: LatticeFile) => {
      // Both non-null by contract: `VISUALIZER_REQUIRES` names them, and
      // the control refuses a file missing either one before it offers the
      // confirmation this runs from.
      const imported = file.visualizer;
      const code = file.code;
      if (!imported || !code) return;

      setTrace(imported.trace);
      setStdout(imported.stdout ?? undefined);
      setTruncated(imported.truncated);
      setCompileCommand(imported.compileCommand ?? undefined);
      setCompilerOutput(imported.compilerOutput ?? undefined);
      // Clamped against the trace it arrived with rather than trusted: the
      // cursor is a saved number and nothing guarantees the file's own
      // trace is as long as it was when that number was written.
      const steps = imported.trace.filter((e): e is StepEvent => !isTruncated(e)).length;
      setStepIndex(Math.min(imported.stepIndex, Math.max(0, steps - 1)));
      // The drawing came from a real run, even though this session never
      // made it — TraceControls should read as "there is a trace here",
      // not as an idle canvas that happens to have something on it.
      setRunStatus("done");
      setRunError(null);

      setInitialSource(code.source);
      setInitialLanguage(code.language);
      setLiveSource(code.source);
      setLiveLanguage(code.language);
      setEditorEpoch((n) => n + 1);
      // A new drawing deserves the opening framing again; without this the
      // camera stays wherever the last one left it.
      framedRef.current = false;

      handleRenameCanvas(file.name);

      // The code is saved onto the canvas. The trace is not, and cannot
      // be: `CanvasPatch` has no `trace_data`, because a trace is recorded
      // by running rather than by asserting. So an imported drawing stands
      // for as long as this page is open and is replaced by the real thing
      // the moment Run is pressed — which, the code having been saved, is
      // a run of the program that produced it.
      getToken()
        .then((token) =>
          updateCanvas(canvasId, { source_code: code.source, language: code.language }, token),
        )
        .catch(() => {
          // Best-effort, same as the autosave — the workspace on screen is
          // correct either way, and the next edit saves again.
        });
    },
    [canvasId, getToken, handleRenameCanvas],
  );

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
    <WorkspaceGate feature="Visualizer">
    <div ref={boundsRef} data-canvas-workspace className="relative h-full w-full overflow-hidden">
      <InfiniteCanvas ref={canvasRef} onZoomChange={setZoom}>
        {diagram && <DiagramView diagram={diagram} zoom={zoom} edgeStyle={edgeStyle} />}
      </InfiniteCanvas>

      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 p-1"
      >
        <div className="shifts-with-sidebar pointer-events-none pl-3">
          <span aria-hidden="true" className="invisible hidden font-mono text-[12px] uppercase tracking-[0.2em] lg:block">
            Visualizer
          </span>
          {/* The page title is decorative — the sidebar already says which
            * workspace this is — so it's the first thing to go when the
            * header would otherwise wrap into three rows and eat half of
            * a small workspace's height. Below `lg` the controls get the
            * whole header to themselves. */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 lg:mt-1.5 xl:gap-x-6">
            <span
              className="hidden font-serif text-xl font-black tracking-tight text-[var(--text-primary)] lg:block xl:text-3xl"
              style={{ filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.55))" }}
            >
              Visualizer
            </span>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 pb-1.5">
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
              <LatticeFileControls
                name={canvasName ?? "Untitled canvas"}
                code={latticeCode}
                visualizer={visualizerData}
                requires={VISUALIZER_REQUIRES}
                onImport={handleImportLattice}
                onNotify={flash}
                // A generated canvas's code belongs to the graph it came
                // from, and the server answers 409 to a `source_code`
                // PATCH on one. Opening a file here would put code in a
                // read-only editor that nothing would ever save.
                importDisabledReason={
                  generatedFrom
                    ? "This canvas is generated from a Code-Canvas graph — open the file there instead"
                    : null
                }
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto mb-1.5 ml-auto flex flex-wrap items-center justify-end gap-1.5 xl:gap-2">
          <EdgeStyleControl value={edgeStyle} onChange={handleEdgeStyle} className="hidden lg:flex" />
          <div className="rail-pill glass-flat flex gap-2 rounded-full px-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Zoom
            </span>
            <span className="w-9 shrink-0 font-mono text-[11px] font-medium text-[var(--text-primary)]">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rail-pill glass-flat inline-flex rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Reset view
          </button>
        </div>
      </div>

      {/* Held back until the canvas has actually loaded.
        *
        * Monaco takes its contents from `defaultValue`, which is read once
        * when the editor instance is created and never again — so mounting
        * before `initialSource` arrives races the canvas fetch against the
        * Monaco chunk load, and when the fetch loses, the editor comes up
        * showing the per-language `localStorage` snippet instead of this
        * canvas's code. That was survivable when the fallback was the
        * user's own last buffer; it is not for a generated canvas, whose
        * whole point is to show the code its graph produced.
        *
        * `undefined` is "not loaded yet" and distinct from `""`, which is
        * a real brand-new canvas with no code in it. */}
      {(initialSource !== undefined || canvasError !== null) && (
      <FloatingEditor
        key={`${canvasId}:${editorEpoch}`}
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
        onLanguageChange={setLiveLanguage}
        readOnly={generatedFrom !== null}
        // The link back to the source graph rides in the editor's header
        // rather than the page's top bar — it's about this code, and the
        // top bar is for the canvas as a whole.
        generatedFrom={generatedFrom}
      />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center">
          <p
            className="matte rounded-full px-4 py-2 font-mono text-[11px] text-[var(--text-primary)]"
            style={{ borderColor: "var(--accent-secondary)" }}
            role="status"
          >
            {toast}
          </p>
        </div>
      )}
    </div>
    </WorkspaceGate>
  );
}
