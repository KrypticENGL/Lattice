"""GDB-embedded tracer harness for C++ (BLUEPRINT.md §7.3).

Loaded via `gdb --batch -x gdb_hook.py --args <binary>` by tracer.py, never
run standalone. Single-steps the debuggee at source-line granularity using
gdb's own DWARF-backed stepper, and after every stop serializes the call
stack and reachable heap into the trace event schema from BLUEPRINT.md §8,
printed as one JSON object per line (NDJSON) to this process's real stdout.

The debuggee's *own* stdout is redirected to a separate capture file (see
`run > ...` below) so user program output never collides with the NDJSON
trace stream; each event's `stdout_delta` is the slice of that file written
since the previous event.
"""

import gdb
import json
import os
import re

SOURCE_BASENAME = os.environ["LATTICE_SOURCE_BASENAME"]
STDOUT_CAPTURE = os.environ["LATTICE_STDOUT_CAPTURE"]
# NOTE on STEP_CAP's limits (§6.3 layer 1, "catches it earliest"): this only
# works when gdb's `step` command actually returns control between source
# lines. For a degenerate tight loop the compiler folds into one self-jumping
# instruction range with no distinct line-table row to stop at (observed with
# `while (true) { i++; }` at -O0), a single `step` call can block forever —
# Python never regains control to check this counter. tracer.py's wall-clock
# timeout (§6.3 layer 2) is the real backstop for that case, not this cap.
STEP_CAP = int(os.environ.get("LATTICE_STEP_CAP", "5000"))
MAX_HEAP_OBJECTS = int(os.environ.get("LATTICE_MAX_HEAP_OBJECTS", "2000"))
MAX_FINISH_HOPS = 200
MAX_ARRAY_ELEMENTS = 256

# `gdb.execute(cmd, to_string=True)` does NOT reliably capture asynchronous
# stop notifications ("Program received signal ...") in its return value —
# they're printed via a separate reporting path. `info program` is a
# synchronous query we control directly, so use that instead to detect
# signals/exit after every stepping command.
SIGNAL_RE = re.compile(r"stopped with signal (\w+), (.+?)\.")
NOT_RUNNING_RE = re.compile(r"not being run")


def emit(event):
    print(json.dumps(event), flush=True)


# ---------------------------------------------------------------------------
# Value serialization: scalars inline, containers (pointers) become
# `{"ref": obj_id}` into the shared heap dict, per §8.
# ---------------------------------------------------------------------------


def type_name(t):
    try:
        return str(t)
    except gdb.error:
        return "<unknown type>"


_CHAR_TYPE_NAMES = {"char", "signed char", "unsigned char"}


def is_char_type(t):
    # t.code == gdb.TYPE_CODE_CHAR would be the direct check, but gdb's
    # Python API has proven to sometimes report a plain `char` pointee as
    # TYPE_CODE_INT depending on how the Type object was reached (observed
    # with gdb 17.2) — match on the type name instead, which is stable.
    name = type_name(t)
    for qualifier in ("const", "volatile"):
        name = name.replace(qualifier, "")
    return name.strip() in _CHAR_TYPE_NAMES


def serialize_scalar(val, code):
    try:
        if code == gdb.TYPE_CODE_BOOL:
            return bool(val)
        if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_ENUM):
            return int(val)
        if code == gdb.TYPE_CODE_FLT:
            return float(val)
        if code == gdb.TYPE_CODE_CHAR:
            return int(val)
    except (gdb.error, ValueError, TypeError):
        pass
    try:
        return str(val)
    except gdb.error as e:
        return f"<error: {e}>"


class HeapWalker:
    """Serializes a value graph into flat `{obj_id: {...}}` heap entries.

    Pointer targets are enqueued and drained breadth-first with a
    placeholder inserted up front, so cyclic structures (a circular linked
    list, a back-edge in a graph) terminate instead of recursing forever.
    """

    def __init__(self):
        self.heap = {}
        self.worklist = []

    def enqueue_pointer(self, ptr_val):
        addr = int(ptr_val)
        if addr == 0:
            return None
        obj_id = f"obj_{addr:x}"
        if obj_id in self.heap:
            return obj_id
        if len(self.heap) >= MAX_HEAP_OBJECTS:
            return None
        self.heap[obj_id] = {"type": "<budget exceeded>", "fields": {}}
        self.worklist.append((obj_id, ptr_val))
        return obj_id

    def serialize_value(self, val):
        try:
            t = val.type.strip_typedefs()
        except gdb.error:
            return None
        code = t.code

        if code == gdb.TYPE_CODE_PTR:
            try:
                target = t.target().strip_typedefs()
            except gdb.error:
                target = None
            if target is not None and is_char_type(target):
                if int(val) == 0:
                    return None
                try:
                    # No `length=` cap: gdb reads exactly that many bytes
                    # rather than stopping early at the terminator, which
                    # overruns short strings into unmapped memory. Truncate
                    # in Python instead, after a normal NUL-terminated read.
                    return val.string()[:4096]
                except Exception:
                    return str(val)
            if int(val) == 0:
                return None
            obj_id = self.enqueue_pointer(val)
            return {"ref": obj_id} if obj_id else None

        if code == gdb.TYPE_CODE_REF:
            try:
                return self.serialize_value(val.referenced_value())
            except gdb.error:
                return None

        if code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            return self.serialize_struct_fields(val, t)

        if code == gdb.TYPE_CODE_ARRAY:
            return self.serialize_array(val, t)

        return serialize_scalar(val, code)

    def serialize_struct_fields(self, val, t):
        fields = {}
        try:
            field_list = t.fields()
        except gdb.error:
            field_list = []
        for f in field_list:
            if f.name is None or getattr(f, "is_base_class", False):
                continue
            if f.name.startswith("_vptr"):
                continue
            try:
                fields[f.name] = self.serialize_value(val[f.name])
            except gdb.error as e:
                fields[f.name] = f"<error: {e}>"
        return {"type": type_name(t), "fields": fields}

    def serialize_array(self, val, t):
        try:
            lo, hi = t.range()
            length = max(0, hi - lo + 1)
        except gdb.error:
            length = 0
        length = min(length, MAX_ARRAY_ELEMENTS)
        items = []
        for i in range(length):
            try:
                items.append(self.serialize_value(val[i]))
            except gdb.error:
                break
        return items

    def drain(self):
        while self.worklist:
            obj_id, ptr_val = self.worklist.pop()
            try:
                deref = ptr_val.dereference()
                t = deref.type.strip_typedefs()
            except gdb.error as e:
                self.heap[obj_id] = {"type": "<unreadable>", "fields": {"error": str(e)}}
                continue
            if t.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
                self.heap[obj_id] = self.serialize_struct_fields(deref, t)
            elif t.code == gdb.TYPE_CODE_ARRAY:
                self.heap[obj_id] = {
                    "type": type_name(t),
                    "fields": {"elements": self.serialize_array(deref, t)},
                }
            else:
                self.heap[obj_id] = {
                    "type": type_name(t),
                    "fields": {"value": serialize_scalar(deref, t.code)},
                }


# ---------------------------------------------------------------------------
# Frame / stack helpers
# ---------------------------------------------------------------------------


def frame_depth():
    depth = 0
    f = gdb.newest_frame()
    while f is not None:
        depth += 1
        f = f.older()
    return depth


def is_user_frame(frame):
    try:
        sal = frame.find_sal()
    except gdb.error:
        return False
    if not sal or not sal.symtab:
        return False
    return os.path.basename(sal.symtab.filename) == SOURCE_BASENAME


def frame_line(frame):
    try:
        sal = frame.find_sal()
        return sal.line if sal else 0
    except gdb.error:
        return 0


def collect_locals(frame):
    """All variables/arguments visible at this frame's current PC, from the
    innermost lexical block outward to the function's top block, filtered to
    those already declared by the current line (later same-block decls are
    still uninitialized garbage and would be misleading to show)."""
    line = frame_line(frame)
    names_seen = set()
    result = {}
    try:
        block = frame.block()
    except (gdb.error, RuntimeError):
        return result
    heap_walker = frame_locals_walker
    b = block
    while b is not None and not b.is_static and not b.is_global:
        for sym in b:
            if not (sym.is_variable or sym.is_argument):
                continue
            if sym.name in names_seen:
                continue
            names_seen.add(sym.name)
            decl_line = getattr(sym, "line", 0) or 0
            if decl_line and decl_line > line:
                continue
            try:
                val = sym.value(frame)
                result[sym.name] = heap_walker.serialize_value(val)
            except gdb.error as e:
                result[sym.name] = f"<error: {e}>"
        b = b.superblock
    return result


def collect_user_frames():
    """Contiguous user-source frames from outermost to innermost (§8: call
    stack, innermost last), stopping at the first non-user frame."""
    frames = []
    f = gdb.selected_frame()
    while f is not None and is_user_frame(f):
        frames.append(f)
        f = f.older()
    frames.reverse()
    out = []
    for fr in frames:
        out.append({"function": fr.name() or "?", "locals": collect_locals(fr)})
    return out


# ---------------------------------------------------------------------------
# stdout capture diffing
# ---------------------------------------------------------------------------

_stdout_pos = 0


def stdout_delta():
    global _stdout_pos
    try:
        size = os.path.getsize(STDOUT_CAPTURE)
    except OSError:
        return ""
    if size <= _stdout_pos:
        return ""
    with open(STDOUT_CAPTURE, "r", errors="replace") as fh:
        fh.seek(_stdout_pos)
        data = fh.read()
    _stdout_pos = size
    return data


# ---------------------------------------------------------------------------
# Stepping loop
# ---------------------------------------------------------------------------


def gdb_exec(cmd):
    """Run a gdb command, returning (output_text, outcome).

    outcome is one of "ok", "exited", "signal:<NAME>:<description>".
    """
    try:
        out = gdb.execute(cmd, to_string=True)
    except gdb.error as e:
        return str(e), "exited"
    try:
        info = gdb.execute("info program", to_string=True)
    except gdb.error:
        info = ""
    if NOT_RUNNING_RE.search(info):
        return out, "exited"
    m = SIGNAL_RE.search(info)
    if m:
        return out, f"signal:{m.group(1)}:{m.group(2)}"
    return out, "ok"


def flush_inferior_stdout():
    """glibc fully-buffers stdout when it isn't a tty (our capture file
    isn't), so printf/cout output sits in the inferior's libc buffer and
    never reaches STDOUT_CAPTURE until the process exits. Force a flush
    after every step so stdout_delta stays accurate step-by-step instead of
    only appearing in one lump at the end."""
    try:
        gdb.execute("call (int) fflush(0)", to_string=True)
    except gdb.error:
        pass  # no running inferior (already exited/crashed) — nothing to flush


def step_and_flush(cmd):
    output, outcome = gdb_exec(cmd)
    if outcome == "ok":
        flush_inferior_stdout()
    return output, outcome


def skip_to_user_frame():
    """After a step lands us in non-user code (STL/libc internals), pop
    back out with `finish` until we're in user code again (or give up)."""
    hops = 0
    while hops < MAX_FINISH_HOPS:
        try:
            frame = gdb.selected_frame()
        except gdb.error:
            return "exited"
        if is_user_frame(frame):
            return "ok"
        _, outcome = step_and_flush("finish")
        if outcome != "ok":
            return outcome
        hops += 1
    return "ok"  # best effort — trace whatever frame we're stuck in


def run():
    global frame_locals_walker

    gdb.execute("break main")
    _, outcome = gdb_exec(f"run > {STDOUT_CAPTURE}")
    if outcome == "exited":
        emit({
            "step": 0, "line": 0, "event": "exception", "function": None,
            "stdout_delta": stdout_delta(), "frames": [], "heap": {},
            "error": {"signal": None, "description": "program exited before reaching main (bad input?)"},
        })
        return

    step = 0
    prev_depth = 0

    while step < STEP_CAP:
        outcome = skip_to_user_frame()
        if outcome != "ok":
            break

        frame = gdb.selected_frame()
        depth = frame_depth()
        line = frame_line(frame)
        func = frame.name() or "?"

        if depth > prev_depth:
            event_type = "call"
        elif depth < prev_depth:
            event_type = "return"
        else:
            event_type = "line"
        prev_depth = depth

        frame_locals_walker = HeapWalker()
        frames = collect_user_frames()
        frame_locals_walker.drain()

        emit({
            "step": step,
            "line": line,
            "event": event_type,
            "function": func,
            "stdout_delta": stdout_delta(),
            "frames": frames,
            "heap": frame_locals_walker.heap,
        })
        step += 1

        _, outcome = step_and_flush("step")
        if outcome == "exited":
            break
        if outcome.startswith("signal:"):
            _, sig_name, sig_desc = outcome.split(":", 2)
            try:
                frame = gdb.selected_frame()
                depth = frame_depth()
                line = frame_line(frame)
                func = frame.name() or "?"
                frame_locals_walker = HeapWalker()
                frames = collect_user_frames()
                frame_locals_walker.drain()
                heap = frame_locals_walker.heap
            except gdb.error:
                func, line, frames, heap = None, line, [], {}
            emit({
                "step": step, "line": line, "event": "exception", "function": func,
                "stdout_delta": stdout_delta(), "frames": frames, "heap": heap,
                "error": {"signal": sig_name, "description": sig_desc},
            })
            return

    if step >= STEP_CAP:
        emit({"step": -1, "event": "truncated", "reason": "step_cap"})


frame_locals_walker = None
run()
