# Lattice

**A data-structure visualizer that watches real code run.**

Lattice compiles your C++ with `g++`, single-steps the resulting binary under
`gdb` inside a locked-down container, and turns each stop into a snapshot of
the call stack and the heap. The frontend replays those snapshots as a
diagram you can scrub through, step by step.

---

## Overview

The design decision the whole project hangs on:

> **The frontend never interprets source code.** It only renders *trace
> events* — a language-agnostic JSON record of what a real runtime actually
> did.

Nothing simulates C++ semantics in JavaScript. A real compiler compiles the
code, a real debugger steps it, and the browser just watches. Three things
fall out of that for free:

- **Correctness.** The picture can't drift from the language, because the
  language produced the picture.
- **Language independence.** Adding a language means writing one new tracer
  that emits the same schema. The API, the sandbox layer, and the entire
  rendering stack stay untouched.
- **Isolation.** "Run the code" and "draw the picture" are different
  processes on different machines. The thing that touches untrusted code has
  no network, no database, and no rendering stack.

Two surfaces sit on top of that engine:

| Surface | Path | What it does |
| --- | --- | --- |
| **Visualizer** | `/dashboard/visualizer/{canvasId}` | Write C++ in a Monaco editor, run it, scrub the trace on an infinite canvas. Code, latest trace, and resume step autosave to the canvas. |
| **Code-Canvas** | `/dashboard/code-canvas/{graphId}` | Build a structure by wiring blocks (list, tree, graph, stack, traverse, insert…). Lattice compiles the graph to C++ and hands it to the Visualizer. |

`Posts`, `Saved`, and `Ask our AI` (Hermes) are scaffolded as
`ComingSoon` placeholders today. Only C++ is wired up; `/api/execute`
rejects every other language with a 400.

`BLUEPRINT.md` is the long-form design document — this README is the short
version plus the parts that are actually built.

---

## Project Structure

```
Lattice/
├── frontend/                        # Next.js 16 App Router UI
│   ├── app/
│   │   ├── layout.tsx               # ClerkProvider, fonts, global shell
│   │   ├── page.tsx                 # public landing page
│   │   └── dashboard/
│   │       ├── layout.tsx           # Clerk auth gate + Sidebar
│   │       ├── page.tsx             # "You" — personal home
│   │       ├── visualizer/
│   │       │   ├── page.tsx         # resumes your latest canvas, or creates one
│   │       │   └── [canvasId]/page.tsx   # the workspace itself
│   │       ├── code-canvas/
│   │       │   ├── page.tsx
│   │       │   └── [graphId]/page.tsx    # node-graph builder
│   │       ├── simulator/ posts/ ai/ saved/
│   ├── components/
│   │   ├── landing/                 # Hero, Navbar, Features, Technologies, …
│   │   └── dashboard/
│   │       ├── visualizer/          # InfiniteCanvas, DiagramView, FloatingEditor,
│   │       │                        #   TraceControls, StdoutModal
│   │       ├── code-canvas/         # NodeCanvas, NodePalette, CodePane, Tutorial
│   │       └── Sidebar, StatCard, ResourceMonitor, ActivityHeatmap, …
│   ├── lib/
│   │   ├── api.ts                   # shared fetch wrapper (attaches Clerk token)
│   │   ├── canvases.ts              # Visualizer canvas CRUD
│   │   ├── code-canvas/             # graph model, codegen port, API client
│   │   ├── trace-schema/            # TS mirror of the Rust trace types + runTrace()
│   │   ├── shape-detection.ts       # heap snapshot → "this is a linked list" → layout
│   │   └── visualizer/              # edge routing styles
│   ├── next.config.ts               # proxies /api/* to the Rust backend
│   └── proxy.ts                     # Clerk middleware matcher
│
├── backend/                         # Rust + Tokio + Axum API
│   ├── src/
│   │   ├── main.rs                  # router, Clerk layer, Docker + Postgres wiring
│   │   ├── api/                     # execute, resources, canvases, code_canvases
│   │   ├── canvases/                # Visualizer canvas data access
│   │   ├── code_canvas/
│   │   │   ├── graph.rs             # block vocabulary + which wires are legal
│   │   │   └── codegen.rs           # graph → C++ source (authoritative)
│   │   ├── sandbox/                 # container spawn, limits, stats sampling
│   │   └── trace/                   # canonical trace-event schema (serde)
│   └── migrations/                  # 0001_canvases, 0002_code_canvases
│
├── tracers/cpp/
│   ├── tracer.py                    # compiles, drives gdb, enforces wall-clock caps
│   ├── gdb_hook.py                  # runs inside gdb; serializes stack + heap per step
│   └── tests/                       # end-to-end tracer tests + linked_list.cpp fixture
│
├── sandbox-images/cpp.Dockerfile    # minimal g++ / gdb / python3 image
└── BLUEPRINT.md                     # full design document
```

---

## Install Guide

### Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| **Node.js** | 20+ (developed on 26) | the Next.js frontend |
| **Rust** | 1.85+ (Cargo edition 2024) | the Axum backend |
| **Docker** | any recent engine | running traces — without it `/api/execute` returns 503 |
| **Python 3** | 3.10+ | running the tracer test suite locally (optional) |
| **Clerk account** | — | auth (free tier is fine) |
| **Postgres** | hosted Supabase, or any Postgres | canvases — the backend refuses to start without it |

### 1. Clone and install

```bash
git clone https://github.com/KrypticENGL/Lattice.git
cd Lattice
npm install                 # root: just `concurrently`
npm install --prefix frontend
```

### 2. Build the sandbox image

Runs from the repo root — the build needs `tracers/cpp/` as context:

```bash
docker build -f sandbox-images/cpp.Dockerfile -t lattice-cpp-tracer .
```

Make sure your user can actually talk to the Docker socket:

```bash
sudo usermod -aG docker "$USER"   # then start a FRESH shell
```

> The backend pings the daemon at startup rather than only checking that the
> socket file exists — a shell that predates `usermod` "connects" but fails on
> every real request. If you see `Docker socket exists but ping failed`, open
> a new terminal.

### 3. Environment

`backend/.env` (copy from `backend/.env.example`):

```ini
CLERK_SECRET_KEY=sk_test_...
DATABASE_URL=postgresql://postgres.<ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> Percent-encode the database password. Supabase generates passwords
> containing `#`, `&`, `%`, `@`, `/` — left raw they split the URL at the
> wrong place, and the failure surfaces as a confusing
> `failed to lookup address information`.

`frontend/.env.local`:

```ini
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
# BACKEND_URL=http://127.0.0.1:3001   # optional; this is the default
```

Migrations run automatically on backend startup — there's no separate
migrate step.

### 4. Run

```bash
npm run dev      # backend (:3001) + frontend (:3000) together
```

Or separately: `npm run dev:backend` / `npm run dev:frontend`. Open
<http://localhost:3000>, sign in, and head to the Visualizer.

### Useful commands

```bash
npm run build                                  # production frontend build
npm run lint                                   # eslint
npm run check                                  # cargo check
cd backend && cargo test                       # schema, graph, and codegen tests
python3 tracers/cpp/tests/test_tracer.py       # tracer end-to-end tests
```

> **Editing a tracer requires rebuilding the image.** `tracers/*.py` is
> `COPY`'d into `lattice-cpp-tracer` at build time — changes do nothing until
> you re-run the `docker build` above.

The dashboard gates on viewport width; it's a desktop surface, and phones get
a `WorkspaceGate` screen instead.

---

## How Things Work

### The trace pipeline

```
Browser (Monaco)
   │  POST /api/execute { language, source, canvas_id }
   ▼
Next.js  ──rewrite /api/*──►  Axum backend  (Clerk verifies the bearer token)
                                   │
                                   │ quota check, then one fresh container per run
                                   ▼
                        Docker: lattice-cpp-tracer
                        --network=none, --read-only, --cap-drop=ALL
                        (+SYS_PTRACE for gdb), 0.5 CPU, 256 MB, 64 pids, uid 1000
                                   │
                        source arrives on stdin
                                   ▼
                        tracer.py  ──►  g++ -g -O0 -Wall
                                   ▼
                        gdb --batch -x gdb_hook.py
                                   │  step, step, step…
                                   ▼
                        NDJSON on stdout, one JSON object per step
                                   │
                    ┌──────────────┴───────────────┐
                    ▼                              ▼
        deserialize against the           persist onto the canvas
        Rust trace schema                 (Postgres, scoped to owner)
                    │
                    ▼
        ExecuteResponse ──► shape-detection.ts ──► DiagramView (SVG)
```

**Step by step:**

1. **Submit.** The editor autosaves to the canvas, and `runTrace()` POSTs the
   buffer with a Clerk session token attached. Source over 64 KB is rejected
   before it ever reaches a container. If the canvas was generated from a
   graph, the backend runs its *stored* source rather than whatever the
   request carried — the step highlight must point at lines that exist.
2. **Reserve.** A per-user lifetime container counter is checked and
   incremented under one lock; past 100 containers the call gets a 429. A
   background task samples container stats every 150 ms so the resource
   monitor has a peak to show — a typical run's container lives about half a
   second, far too briefly for external polling to catch.
3. **Compile.** Inside the container, `tracer.py` compiles with `-g -O0 -Wall`.
   A failure prints one `{"error": "compile_error"}` object and exits; the API
   turns that into a 400, still recorded onto the canvas so a reload shows the
   same error rather than a stale trace. A successful compile emits a preamble
   line carrying the `g++` command and any warnings, so the UI can show a real
   compile-then-run transcript.
4. **Step.** `gdb_hook.py` runs inside gdb's embedded Python. After each
   source-line stop it walks the call stack and the reachable heap and emits
   one NDJSON event: `{ step, line, event, function, stdout_delta, frames,
   heap }`. The program's own stdout goes to a separate capture file, so user
   output never collides with the trace stream — each event carries only the
   slice written since the previous one. By default only steps that *change
   the heap* become events; a line-by-line trace is mostly identical frames.
5. **Bound it.** Runaway execution is caught at three independent layers: a
   step cap inside gdb (5000), a wall-clock timeout in `tracer.py`, and the
   orchestrator's own 15 s deadline plus a 5 MB output cap. Hitting any of
   them appends `{"step": -1, "event": "truncated", "reason": …}` and exits
   cleanly — truncation is a normal outcome, not a crash.
6. **Validate.** The backend deserializes the NDJSON against the Rust schema.
   That's a real trust boundary: the tracer runs against attacker-controlled
   source, so malformed output fails loudly here instead of flowing onward.
   Field order is preserved with `IndexMap` — `HashMap`'s randomized iteration
   once scrambled `left`/`right`, and trees rendered with children on
   inconsistent sides between runs.
7. **Render.** `shape-detection.ts` takes a step's heap plus the objects
   reachable from the current locals, classifies the cluster, and lays it out.
   Linked lists and trees get dedicated layouts; anything else falls back to a
   generic node-link layout, so nothing ever fails to draw. Real code usually
   reaches a structure through a wrapper (`LinkedList list;` holding a
   `head`), so the walker descends into embedded struct values to find refs
   and then walks *through* the wrapper to the actual data root — you see the
   list, not a box labelled `LinkedList`.
8. **Scrub.** `TraceControls` steps, plays, and scrubs the event array;
   `DiagramView` animates between adjacent steps. The current index is
   debounce-saved to the canvas, so reopening resumes where you left off.

### Code-Canvas → C++

Drag blocks onto the canvas and wire them. The graph model
(`code_canvas/graph.rs`) decides which handles exist and which connections
are legal; `codegen.rs` compiles the graph into a C++ program shaped
`includes → structs → helpers → main { allocate, wire, name, operate }`.
Allocating every node before wiring any of them is what makes cyclic graphs —
a list that loops back on itself, a general digraph — emit valid code for
free. Parts that can't compile (an unwired operation, a connection C++ can't
express) come back as **notes**, never errors: a half-built graph is the
normal state of a canvas someone is still working on.

`frontend/lib/code-canvas/codegen.ts` is a port of the same algorithm, kept
so the code pane can update on every keystroke without a round trip. **The two
must emit identical text — a change to one is a change to both.**

Pressing **Visualize** (`POST /api/code-canvases/{id}/visualize`) compiles the
graph into a linked Visualizer canvas and returns its id. Each graph keeps
exactly one derived canvas — pressing it again refreshes that canvas in place
instead of littering the Visualizer. A derived canvas renders read-only for as
long as its graph exists; delete the graph and the canvas becomes editable
again, since read-only is a property of being *linked*, not of having once
been generated.

### API surface

Everything except `/api/health` sits behind a Clerk layer, and every query is
scoped to the caller's Clerk `sub`.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | liveness — the only unauthenticated route |
| `POST /api/execute` | compile + trace, optionally recording onto a canvas |
| `GET /api/resources` | container quota, peak CPU/memory for this user |
| `GET` `POST /api/canvases` | list / create Visualizer canvases |
| `GET` `PATCH` `DELETE /api/canvases/{id}` | read, autosave, delete |
| `GET` `POST /api/code-canvases` | list / create graphs |
| `GET` `PATCH` `DELETE /api/code-canvases/{id}` | read, save graph, delete |
| `POST /api/code-canvases/{id}/generate` | preview the generated C++ |
| `POST /api/code-canvases/{id}/visualize` | compile into a linked canvas |

The browser always calls relative `/api/*` paths; `next.config.ts` rewrites
them to the backend, so client code never needs to know its origin.

### Data model

- **`canvases`** — a Visualizer workspace: source, latest trace (`JSONB`),
  stdout, compile transcript, resume step, plus `origin` (`user` /
  `code_canvas`) and a nullable `code_canvas_id`.
- **`code_canvases`** — the node graph, stored whole as `JSONB`. Nothing
  queries *into* a graph; it's always read and written as one document, so the
  editor's own model is the storage format.

Deleting a graph is `ON DELETE SET NULL`, not `CASCADE` — losing a graph
shouldn't take the traces it produced with it.

---

## Tech Stack

**Frontend**

| | |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Editor | Monaco (`@monaco-editor/react`) + `monaco-vim` |
| Animation | Framer Motion, anime.js |
| Auth | Clerk (`@clerk/nextjs`) |
| Diagrams | hand-rolled SVG on a custom infinite canvas |

**Backend**

| | |
| --- | --- |
| Runtime | Rust (edition 2024) + Tokio |
| HTTP | Axum 0.8 |
| Auth | `clerk-rs` with JWKS memory cache |
| Database | Postgres (hosted Supabase) via `sqlx` — runtime-checked queries, so `cargo check` never needs a live DB |
| Docker control | `bollard` (async Docker Engine API) |
| Serialization | `serde` / `serde_json` / `indexmap` |
| Observability | `tracing` + `tracing-subscriber` |

**Sandbox & tracing**

| | |
| --- | --- |
| Isolation | Docker: `--network=none`, read-only rootfs + exec tmpfs, `--cap-drop=ALL` (+`SYS_PTRACE`), uid 1000, 0.5 CPU, 256 MB, no swap, 64 pids |
| Image | `debian:bookworm-slim` + `g++`, `gdb`, `python3` — nothing else |
| C++ tracer | `tracer.py` (orchestration, caps) + `gdb_hook.py` (gdb-embedded Python, DWARF-backed stepping) |
| Wire format | NDJSON trace events, schema owned by `backend/src/trace` |

**Tooling**

`concurrently` for the combined dev server, ESLint, `cargo test` for schema /
graph / codegen, Python `unittest` for end-to-end tracer coverage against a
real `linked_list.cpp` fixture.
