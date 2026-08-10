"""Golden-trace test for the C++ tracer (BLUEPRINT.md §13).

Runs tracer.py against a hand-verified snippet (build a 4-node linked list,
sum it, print the result) and checks the trace tells the truth about that
execution. Raw pointer addresses aren't deterministic across runs/machines,
so this asserts on trace *structure* (values, ref chains, stdout, final
state) rather than a byte-for-byte expected-output diff.

Run with: python3 -m unittest tracers/cpp/tests/test_tracer.py -v
"""

import json
import pathlib
import subprocess
import sys
import unittest

TRACER = pathlib.Path(__file__).resolve().parent.parent / "tracer.py"
FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "linked_list.cpp"


def run_tracer(source_path, **kwargs):
    """Returns (result, trace_events, preamble). `preamble` is the
    {"compile_command": ..., "compiler_output": ...} line a *successful*
    compile emits before any trace events (None on a compile failure,
    where the single line is a {"error": "compile_error", ...} object
    instead — left in `trace_events` as-is for that test to inspect)."""
    args = [sys.executable, str(TRACER), str(source_path)]
    for key, value in kwargs.items():
        args += [f"--{key.replace('_', '-')}", str(value)]
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    if lines and "compile_command" in lines[0]:
        return result, lines[1:], lines[0]
    return result, lines, None


def walk_linked_list(step_event, head_var="head"):
    """Follow `next` refs from a frame local, return the list of `val`s."""
    heap = step_event["heap"]
    locals_ = step_event["frames"][-1]["locals"]
    values = []
    current = locals_.get(head_var)
    seen = set()
    while current is not None:
        obj_id = current["ref"]
        if obj_id in seen:
            break  # cycle guard, shouldn't trigger for this fixture
        seen.add(obj_id)
        node = heap[obj_id]
        values.append(node["fields"]["val"])
        current = node["fields"]["next"]
    return values


class TestLinkedListGoldenTrace(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result, cls.events, cls.preamble = run_tracer(FIXTURE)

    def test_exits_cleanly(self):
        self.assertEqual(self.result.returncode, 0, self.result.stderr)
        self.assertTrue(self.events, "expected at least one trace event")

    def test_compile_preamble_present_and_clean(self):
        self.assertIsNotNone(self.preamble)
        self.assertIn("g++", self.preamble["compile_command"])
        self.assertIn("source.cpp", self.preamble["compile_command"])
        # This fixture is warning-free under -Wall.
        self.assertEqual(self.preamble["compiler_output"], "")

    def test_no_exception_or_truncation(self):
        for event in self.events:
            self.assertNotEqual(event.get("event"), "exception", event)
            self.assertNotEqual(event.get("event"), "truncated", event)

    def test_first_event_is_call_into_main(self):
        first = self.events[0]
        self.assertEqual(first["event"], "call")
        self.assertEqual(first["function"], "main")

    def test_final_linked_list_shape_and_values(self):
        last = self.events[-1]
        self.assertEqual(walk_linked_list(last), [3, 7, 1, 9])

    def test_sum_computed_correctly(self):
        last = self.events[-1]
        sum_local = last["frames"][-1]["locals"]["sum"]
        self.assertEqual(sum_local, 20)

    def test_stdout_matches_printf(self):
        combined_stdout = "".join(e.get("stdout_delta", "") for e in self.events)
        self.assertEqual(combined_stdout, "sum=20\n")

    def test_pointer_refs_are_consistent_within_a_step(self):
        # Every {"ref": obj_id} in a step's frames must resolve to a real
        # heap entry within that same step's heap snapshot (§8: full
        # snapshot per step, not a diff).
        for event in self.events:
            heap = event["heap"]
            for frame in event["frames"]:
                for value in frame["locals"].values():
                    if isinstance(value, dict) and "ref" in value:
                        self.assertIn(value["ref"], heap, event)

    def test_step_count_is_bounded_and_reasonable(self):
        # Building 4 nodes + a 4-iteration traversal loop + a couple of
        # bookkeeping lines shouldn't take anywhere near the 5000 step cap.
        self.assertLess(len(self.events), 100)
        self.assertGreater(len(self.events), 10)


class TestCompileError(unittest.TestCase):
    def test_invalid_source_reports_compile_error(self):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".cpp", mode="w", delete=False) as fh:
            fh.write("int main() { this is not cpp; }")
            path = fh.name
        result, events, preamble = run_tracer(path)
        self.assertEqual(result.returncode, 1)
        self.assertIsNone(preamble)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["error"], "compile_error")


if __name__ == "__main__":
    unittest.main()
