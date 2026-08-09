# Minimal sandbox image for the C++ tracer (BLUEPRINT.md §6, §7.3).
#
# Isolation is enforced primarily at container *run* time by the
# orchestrator (backend/src/sandbox/): --network=none, --read-only rootfs
# with a small tmpfs /tmp, --cap-drop=ALL (+SYS_PTRACE — gdb needs it to
# ptrace its own child, see sandbox/mod.rs for why that one capability is
# a deliberate, documented exception), --user, and cpu/mem/pids limits.
# This image just ships nothing beyond what the tracer needs and never
# defaults to root.
#
# Build from the repo root (needs the tracers/cpp/ build context):
#   docker build -f sandbox-images/cpp.Dockerfile -t lattice-cpp-tracer .

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ \
        gdb \
        python3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1000 --create-home --shell /usr/sbin/nologin tracer

COPY tracers/cpp/tracer.py /opt/lattice/tracer.py
COPY tracers/cpp/gdb_hook.py /opt/lattice/gdb_hook.py

USER tracer
WORKDIR /home/tracer

# Source arrives on stdin (tracer.py reads it when no path arg is given);
# trace events go to stdout as NDJSON. No network, no other I/O.
ENTRYPOINT ["python3", "/opt/lattice/tracer.py"]
