#!/usr/bin/env python3
"""C++ tracer entry point (BLUEPRINT.md §7.3, §7 contract).

Compiles a C++ source file with debug info, then drives gdb's embedded
Python interpreter (`gdb_hook.py`, loaded via `-x`) to single-step real
execution and emit one newline-delimited JSON trace event (§8) per step to
stdout. Never interprets the source itself — gdb and the real compiled
binary do all the work; this script only orchestrates and enforces the
wall-clock/output caps from §6.3 (the per-step cap lives inside
gdb_hook.py, which is cheaper and catches runaway loops earliest).

Usage:
    tracer.py source.cpp [--step-cap N] [--timeout SECONDS] [--std STD]
    cat source.cpp | tracer.py [--step-cap N] ...

Output contract:
    - One JSON object per line (NDJSON) on stdout for each trace event.
    - A compile failure prints a single JSON object
      {"error": "compile_error", "message": "..."} and exits 1.
    - A successful compile first prints one preamble line
      {"compile_command": "...", "compiler_output": "..."} (compiler_output
      is "" when there were no warnings) before any trace events, so a
      caller can show a real compile-then-run transcript instead of just
      the program's own stdout.
    - Hitting the wall-clock timeout or output cap prints a final line
      {"step": -1, "event": "truncated", "reason": "..."} and exits 0 —
      this is a normal outcome (§6.3), not a crash.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading

HOOK_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gdb_hook.py")

DEFAULT_STEP_CAP = 5000
DEFAULT_TIMEOUT_SECONDS = 10
DEFAULT_MAX_HEAP_OBJECTS = 2000
DEFAULT_OUTPUT_BYTE_CAP = 5 * 1024 * 1024  # 5 MB, §6.3 item 3


def emit(obj):
    print(json.dumps(obj), flush=True)


def compile_source(source_path, workdir, std):
    binary_path = os.path.join(workdir, "a.out")
    # -Wall (diagnostics only, not -Werror — a warning must never turn a
    # snippet that actually runs into a hard failure) so the compiler
    # preamble has real, common warnings to show, not just the errors
    # g++ already flags without any -W flags at all.
    flags = ["-g", "-O0", "-Wall", f"-std={std}"]
    command = ["g++", *flags, "-o", binary_path, source_path]
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    display_command = " ".join(["g++", *flags, "-o", "a.out", "source.cpp"])
    # g++ reports diagnostics against the real (temp-dir) path — replace
    # it with the plain filename so output reads like it would in a
    # normal working directory, not our ephemeral sandbox tmpdir.
    stderr = result.stderr.replace(source_path, "source.cpp")
    if result.returncode != 0:
        return None, stderr, display_command
    # Even a successful compile can write warnings to stderr — surfaced
    # via the caller's preamble line rather than silently discarded.
    return binary_path, stderr, display_command


def run_gdb(binary_path, workdir, step_cap, max_heap_objects, timeout_seconds, output_byte_cap):
    stdout_capture = os.path.join(workdir, "program_stdout.txt")
    open(stdout_capture, "w").close()

    env = dict(os.environ)
    env["LATTICE_SOURCE_BASENAME"] = "source.cpp"
    env["LATTICE_STDOUT_CAPTURE"] = stdout_capture
    env["LATTICE_STEP_CAP"] = str(step_cap)
    env["LATTICE_MAX_HEAP_OBJECTS"] = str(max_heap_objects)

    proc = subprocess.Popen(
        ["gdb", "--nx", "--batch", "-q", "-x", HOOK_SCRIPT, "--args", binary_path],
        cwd=workdir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )

    hit_timeout = False

    def on_timeout():
        nonlocal hit_timeout
        hit_timeout = True
        try:
            proc.kill()
        except ProcessLookupError:
            pass

    timer = threading.Timer(timeout_seconds, on_timeout)
    timer.daemon = True
    timer.start()

    bytes_relayed = 0
    truncated_reason = None
    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            if not line.startswith("{"):
                continue  # ignore stray gdb banner/noise, defense in depth
            bytes_relayed += len(line)
            if bytes_relayed > output_byte_cap:
                truncated_reason = "output_cap"
                proc.kill()
                break
            print(line, flush=True)
    finally:
        timer.cancel()
        if proc.poll() is None:
            proc.wait(timeout=5)

    if hit_timeout and truncated_reason is None:
        truncated_reason = "timeout"

    if truncated_reason:
        emit({"step": -1, "event": "truncated", "reason": truncated_reason})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", help="path to a C++ source file (reads stdin if omitted)")
    parser.add_argument("--step-cap", type=int, default=DEFAULT_STEP_CAP)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--max-heap-objects", type=int, default=DEFAULT_MAX_HEAP_OBJECTS)
    parser.add_argument("--output-byte-cap", type=int, default=DEFAULT_OUTPUT_BYTE_CAP)
    parser.add_argument("--std", default="c++17")
    args = parser.parse_args()

    source_text = open(args.source, encoding="utf-8").read() if args.source else sys.stdin.read()

    with tempfile.TemporaryDirectory(prefix="lattice-cpp-trace-") as workdir:
        source_path = os.path.join(workdir, "source.cpp")
        with open(source_path, "w", encoding="utf-8") as fh:
            fh.write(source_text)

        binary_path, compiler_stderr, display_command = compile_source(source_path, workdir, args.std)
        if binary_path is None:
            emit({"error": "compile_error", "message": compiler_stderr})
            sys.exit(1)

        emit({"compile_command": display_command, "compiler_output": compiler_stderr})

        run_gdb(
            binary_path,
            workdir,
            step_cap=args.step_cap,
            max_heap_objects=args.max_heap_objects,
            timeout_seconds=args.timeout,
            output_byte_cap=args.output_byte_cap,
        )


if __name__ == "__main__":
    main()
