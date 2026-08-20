"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import NodeCanvas, { type NodeCanvasHandle, type Selection } from "@/components/dashboard/code-canvas/NodeCanvas";
import NodePalette from "@/components/dashboard/code-canvas/NodePalette";
import CodePane from "@/components/dashboard/code-canvas/CodePane";
import Tutorial, { TUTORIAL_STORAGE_KEY } from "@/components/dashboard/code-canvas/Tutorial";
import CanvasNameField from "@/components/dashboard/CanvasNameField";
import {
  connect,
  connectionError,
  createNode,
  freeSpotNear,
  nodeSize,
  NODE_TYPES,
  parseGraph,
  removeEdge,
  removeNode,
  type CanvasGraph,
  type NodeKind,
} from "@/lib/code-canvas/graph";
import { generateCpp } from "@/lib/code-canvas/codegen";
import {
  getCodeCanvas,
  updateCodeCanvas,
  visualizeCodeCanvas,
} from "@/lib/code-canvas/api";

const HEADER_GAP = 16;
/** Where this page used to keep the graph, before it had a backend. Read
 * once on load to migrate a browser that still has one, then cleared. */
const LEGACY_GRAPH_KEY = "lattice:code-canvas:graph:v1";
/** Pane width stays local: it's a preference about this browser window,
 * not part of the graph. */
const PANE_WIDTH_STORAGE_KEY = "lattice:code-canvas:pane-width";
/** Debounce on the graph PATCH. Longer than a drag frame, short enough
 * that closing the tab straight after an edit doesn't lose it. */
const SAVE_DEBOUNCE_MS = 600;
const DEFAULT_PANE_WIDTH = 520;

/** A graph left in `localStorage` by the pre-backend build, if any. */
function readLegacyGraph(): CanvasGraph | null {
  try {
    const saved = window.localStorage.getItem(LEGACY_GRAPH_KEY);
    return saved ? parseGraph(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

export default function CodeCanvasPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { graphId } = useParams<{ graphId: string }>();
  const canvasRef = useRef<NodeCanvasHandle>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [graph, setGraph] = useState<CanvasGraph>({ nodes: [], edges: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [zoom, setZoom] = useState(1);
  const [topInset, setTopInset] = useState(96);
  const [paneWidth, setPaneWidth] = useState(DEFAULT_PANE_WIDTH);
  const [paneMinimized, setPaneMinimized] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Bumped on every open so <Tutorial> remounts and rewinds to step one.
  const [tutorialRun, setTutorialRun] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [graphName, setGraphName] = useState<string | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** False until the stored graph has arrived. Gates the autosave below so
   * the empty initial state can't be written over the saved graph in the
   * moment before it loads. */
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Block currently being dragged out of the palette, in viewport coords. */
  const [paletteDrag, setPaletteDrag] = useState<{ kind: NodeKind; x: number; y: number } | null>(null);

  /* -------------------------------------------------------------- */
  /* Load / save                                                     */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setHydrated(false);
      setLoadError(null);
      // Browser-local preferences, unrelated to the stored graph.
      try {
        const savedWidth = Number.parseInt(
          window.localStorage.getItem(PANE_WIDTH_STORAGE_KEY) ?? "",
          10,
        );
        if (Number.isFinite(savedWidth)) setPaneWidth(savedWidth);
        if (window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === null) setTutorialOpen(true);
      } catch {
        // Storage unavailable (private mode) — defaults are fine.
      }
      try {
        const token = await getToken();
        const canvas = await getCodeCanvas(graphId, token);
        if (cancelled) return;

        setGraphName(canvas.name);
        // A graph left in this browser by the pre-backend build is adopted
        // into an empty workspace, once — the autosave below pushes it up
        // and the key is cleared, so it can't come back. Nothing else is
        // substituted for an empty graph: new workspaces are seeded with
        // the worked example when they're created (see the entry route),
        // which leaves Clear free to actually mean empty.
        let graph = canvas.graph;
        if (graph.nodes.length === 0) {
          const legacy = readLegacyGraph();
          if (legacy && legacy.nodes.length > 0) graph = legacy;
        }
        try {
          window.localStorage.removeItem(LEGACY_GRAPH_KEY);
        } catch {
          // Storage unavailable — nothing to migrate from anyway.
        }
        setGraph(graph);
        setHydrated(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load this graph.");
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [graphId, getToken]);

  // Autosave. The graph object identity changes on every edit — including
  // every frame of a node drag — so the timer restarts until the user
  // stops, and one PATCH goes out per burst of activity.
  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      getToken()
        .then((token) => updateCodeCanvas(graphId, { graph }, token))
        .then(() => setSaveError(null))
        .catch((err) => {
          setSaveError(err instanceof Error ? err.message : "Couldn't save this graph.");
        });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [graph, hydrated, graphId, getToken]);

  /* -------------------------------------------------------------- */
  /* Graph edits                                                     */
  /* -------------------------------------------------------------- */

  const generated = useMemo(() => generateCpp(graph), [graph]);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2600);
  }, []);

  const handleNodeMove = useCallback((id: string, x: number, y: number) => {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  }, []);

  const handleFieldChange = useCallback((id: string, field: string, value: string) => {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((n) =>
        n.id === id ? { ...n, fields: { ...n.fields, [field]: value } } : n,
      ),
    }));
  }, []);

  // Validated outside the state updater on purpose: rejecting a wire has to
  // raise a toast, and a `setGraph` updater has to stay pure (it runs twice
  // under StrictMode).
  const handleConnect = useCallback(
    (from: string, fromPort: string, to: string, toPort: string) => {
      const source = graph.nodes.find((n) => n.id === from);
      const target = graph.nodes.find((n) => n.id === to);
      if (!source || !target) return;
      const problem = connectionError(graph, source, fromPort, target, toPort);
      if (problem) {
        flash(problem);
        return;
      }
      setGraph((current) => connect(current, from, fromPort, to, toPort));
    },
    [flash, graph],
  );

  // Set once a palette press turns into a real drag, so the click that
  // follows pointerup doesn't *also* drop a block in the middle.
  const paletteDraggedRef = useRef(false);

  const handleAddNode = useCallback(
    (kind: NodeKind) => {
      if (paletteDraggedRef.current) return;
      const at = canvasRef.current?.viewportCenter() ?? { x: 0, y: 0 };
      const spot = freeSpotNear(graph, kind, Math.round(at.x - 90), Math.round(at.y - 40));
      const node = createNode(kind, spot.x, spot.y);
      setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelection({ type: "node", id: node.id });
    },
    [graph],
  );

  const handleDropNode = useCallback((kind: NodeKind, x: number, y: number) => {
    const node = createNode(kind, x, y);
    setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelection({ type: "node", id: node.id });
  }, []);

  const handlePaletteDragStart = useCallback(
    (kind: NodeKind, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      paletteDraggedRef.current = false;
      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        if (!paletteDraggedRef.current) {
          // A few pixels of slop, so a slightly shaky click stays a click.
          if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
          paletteDraggedRef.current = true;
        }
        setPaletteDrag({ kind, x: ev.clientX, y: ev.clientY });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setPaletteDrag(null);
        if (!paletteDraggedRef.current) return;

        // Dropped back onto a piece of chrome rather than the canvas.
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        if (under?.closest('[data-tour="palette"], [data-tour="code-pane"], [data-tour="help"]')) return;

        const at = canvasRef.current?.screenToWorld(ev.clientX, ev.clientY);
        if (!at) return;
        const { width, height } = nodeSize(kind);
        handleDropNode(kind, Math.round(at.x - width / 2), Math.round(at.y - height / 2));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [handleDropNode],
  );

  const handleDeleteNode = useCallback((id: string) => {
    setGraph((current) => removeNode(current, id));
    setSelection((current) => (current?.id === id ? null : current));
  }, []);

  const handleDeleteEdge = useCallback((id: string) => {
    setGraph((current) => removeEdge(current, id));
    setSelection((current) => (current?.id === id ? null : current));
  }, []);

  const handleClear = useCallback(() => {
    setGraph({ nodes: [], edges: [] });
    setSelection(null);
  }, []);

  // Delete/Backspace removes whatever is selected — but never while a node's
  // own value field has focus, where those keys mean "edit text".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      if (!selection) return;
      e.preventDefault();
      if (selection.type === "node") handleDeleteNode(selection.id);
      else handleDeleteEdge(selection.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDeleteEdge, handleDeleteNode, selection]);

  /* -------------------------------------------------------------- */
  /* Chrome                                                          */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setTopInset(el.getBoundingClientRect().height + HEADER_GAP);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handlePaneWidth = useCallback((width: number) => {
    setPaneWidth(width);
    try {
      window.localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Best-effort.
    }
  }, []);

  const openTutorial = useCallback(() => {
    setTutorialRun((run) => run + 1);
    setTutorialOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    } catch {
      // Best-effort — worst case the tour offers itself again next visit.
    }
  }, []);

  /**
   * Hands the graph to the Visualizer (BLUEPRINT.md §4.3).
   *
   * The backend compiles the *stored* graph and pushes the result into the
   * canvas linked to it — creating that canvas the first time, refreshing
   * it after — so pressing this repeatedly keeps one derived canvas rather
   * than spawning one per press. Any pending edit is flushed first, since
   * a debounced save still in flight would otherwise mean generating from
   * a graph one revision behind what's on screen.
   */
  const handleOpenInVisualizer = useCallback(async () => {
    setHandingOff(true);
    setHandoffError(null);
    try {
      const token = await getToken();
      await updateCodeCanvas(graphId, { graph }, token);
      const result = await visualizeCodeCanvas(graphId, token);
      router.push(`/dashboard/visualizer/${result.canvas_id}`);
    } catch (err) {
      setHandoffError(err instanceof Error ? err.message : "Couldn't open this in the Visualizer.");
      setHandingOff(false);
    }
  }, [graph, graphId, getToken, router]);

  const handleRenameGraph = useCallback(
    (name: string) => {
      setGraphName(name);
      getToken()
        .then((token) => updateCodeCanvas(graphId, { name }, token))
        .catch(() => {
          // Best-effort, same as the Visualizer's own rename — a failed
          // PATCH here isn't worth a dedicated error state.
        });
    },
    [graphId, getToken],
  );

  const rightInset = paneMinimized ? 120 : paneWidth + 32;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <NodeCanvas
        ref={canvasRef}
        graph={graph}
        selection={selection}
        rightInset={rightInset}
        topInset={topInset}
        onSelect={setSelection}
        onNodeMove={handleNodeMove}
        onFieldChange={handleFieldChange}
        onConnect={handleConnect}
        onDeleteNode={handleDeleteNode}
        onDeleteEdge={handleDeleteEdge}
        dropping={!!paletteDrag}
        onZoomChange={setZoom}
        onRejectConnection={flash}
      />

      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pr-[520px]">
          <p className="max-w-xs text-center font-mono text-[11px] uppercase leading-relaxed tracking-wider text-[var(--text-secondary)]">
            Drag a block out of the palette
            <br />
            to start building
          </p>
        </div>
      )}

      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-end justify-between gap-4 p-1"
      >
        <div className="shifts-with-sidebar pointer-events-none pl-8">
          <span aria-hidden="true" className="invisible block font-mono text-[13px] uppercase tracking-[0.2em]">
            Code-Canvas
          </span>
          <div className="mt-2 flex flex-wrap items-end gap-8">
            <span
              className="block font-serif text-4xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl"
              style={{ filter: "drop-shadow(0 2px 16px rgba(0,0,0,0.55))" }}
            >
              Code-Canvas
            </span>
            <div className="pointer-events-auto flex items-center gap-3 pb-1">
              <span className="matte flex items-center gap-3 rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{graph.nodes.length}</span> blocks
                <span className="h-3 w-px bg-[var(--hairline)]" />
                <span className="text-[var(--text-primary)]">{graph.edges.length}</span> wires
              </span>
              <CanvasNameField name={graphName} onRename={handleRenameGraph} />
              <button
                type="button"
                onClick={handleClear}
                disabled={graph.nodes.length === 0}
                className="matte rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)] disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto mb-2 flex items-center gap-3">
          <span className="matte hidden rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] xl:inline-block">
            Scroll to zoom · Drag to pan
          </span>
          <div className="matte flex items-center gap-3 rounded-full px-4 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">Zoom</span>
            <span className="w-10 shrink-0 font-mono text-[12px] font-medium text-[var(--text-primary)]">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => canvasRef.current?.fitToGraph()}
            disabled={graph.nodes.length === 0}
            className="matte rounded-full px-4 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)] disabled:opacity-40"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => canvasRef.current?.resetView()}
            className="matte rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
          >
            Reset view
          </button>
        </div>
      </div>

      <NodePalette onAdd={handleAddNode} onDragStart={handlePaletteDragStart} />

      {paletteDrag && (
        <div
          className="pointer-events-none fixed z-40 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{
            left: paletteDrag.x,
            top: paletteDrag.y,
            width: NODE_TYPES[paletteDrag.kind].width,
            transform: "translate(-50%, -50%)",
            background: "var(--bg-surface)",
            border: `1px solid ${NODE_TYPES[paletteDrag.kind].accent}`,
            boxShadow: "0 20px 40px -18px rgba(0,0,0,0.9)",
            opacity: 0.92,
          }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: NODE_TYPES[paletteDrag.kind].accent }}
          />
          <span className="truncate font-serif text-[12px] font-semibold text-[var(--text-primary)]">
            {NODE_TYPES[paletteDrag.kind].label}
          </span>
        </div>
      )}

      <CodePane
        code={generated.code}
        notes={generated.notes}
        topInset={topInset}
        width={paneWidth}
        onWidthChange={handlePaneWidth}
        minimized={paneMinimized}
        onMinimizedChange={setPaneMinimized}
        onOpenInVisualizer={handleOpenInVisualizer}
        handingOff={handingOff}
        handoffError={handoffError}
      />

      <button
        type="button"
        data-tour="help"
        onClick={openTutorial}
        title="Show the Code-Canvas tutorial"
        aria-label="Show the Code-Canvas tutorial"
        className="matte shifts-with-sidebar absolute bottom-6 left-2 z-20 flex h-11 w-11 items-center justify-center rounded-full font-serif text-[17px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)]"
      >
        ?
      </button>

      {(toast ?? saveError ?? loadError) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center">
          <p
            className="matte rounded-full px-4 py-2 font-mono text-[11px] text-[var(--text-primary)]"
            style={{ borderColor: "var(--accent-secondary)" }}
            role="status"
          >
            {toast ?? saveError ?? loadError}
          </p>
        </div>
      )}

      <Tutorial key={tutorialRun} open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
}
