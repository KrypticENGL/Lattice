"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type Lang = "cpp" | "javascript" | "python";

const LANGS: { id: Lang; label: string; available: boolean }[] = [
  { id: "cpp", label: "C++", available: true },
  { id: "javascript", label: "JavaScript", available: false },
  { id: "python", label: "Python", available: false },
];

const DEFAULT_CODE = `Node* head = new Node(3);
head->next = new Node(7);
head->next->next = new Node(1);
head->next->next->next = new Node(9);`;

const TRACE_NODES = [
  { x: 30, y: 60, label: "3", color: "var(--accent-secondary)" },
  { x: 130, y: 60, label: "7", color: "#c2703d" },
  { x: 230, y: 60, label: "1", color: "#e8993d" },
  { x: 320, y: 60, label: "9", color: "var(--accent-primary)" },
];

export default function CodeFlowSimulator() {
  const [lang] = useState<Lang>("cpp");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [step, setStep] = useState(0); // 0 = idle, 1..N = nodes revealed

  const running = step > 0;

  function run() {
    setStep(1);
  }

  function next() {
    setStep((s) => Math.min(s + 1, TRACE_NODES.length));
  }

  function prev() {
    setStep((s) => Math.max(s - 1, 1));
  }

  return (
    <div className="matte flex h-full min-h-0 flex-col rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
          Step through your code&rsquo;s execution
        </span>

        <div className="flex gap-1 rounded-full border border-[var(--hairline)] p-0.5">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={!l.available}
              title={l.available ? undefined : `${l.label} support is coming soon`}
              className="rounded-full px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: lang === l.id ? "var(--accent-primary)" : "transparent",
                color: lang === l.id ? "var(--bg-base)" : "var(--text-secondary)",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <div className="glass flex flex-col overflow-hidden rounded-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/70" />
              <span className="ml-2 font-mono text-[13px] text-[var(--text-secondary)]">
                snippet.cpp
              </span>
            </div>
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
              C++
            </span>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={7}
            aria-label="C++ code to trace"
            className="w-full flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-[var(--text-primary)] focus:outline-none"
          />

          <div className="flex shrink-0 items-center justify-between border-t border-[var(--hairline)] px-4 py-3">
            <button
              type="button"
              onClick={run}
              className="rounded-full px-4 py-2 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_20px_var(--accent-glow)]"
              style={{ background: "var(--accent-primary)" }}
            >
              {running ? "Run again" : "Run trace"}
            </button>

            {running && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={prev}
                  disabled={step <= 1}
                  aria-label="Previous step"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                  step {step}/{TRACE_NODES.length}
                </span>
                <button
                  type="button"
                  onClick={next}
                  disabled={step >= TRACE_NODES.length}
                  aria-label="Next step"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="glass flex flex-col overflow-hidden rounded-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
            <span className="font-mono text-[13px] text-[var(--text-secondary)]">
              lattice.trace() &rarr; LinkedList
            </span>
            {running && (
              <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[12px] text-[var(--text-secondary)]">
                step {step.toString().padStart(2, "0")}/
                {TRACE_NODES.length.toString().padStart(2, "0")}
              </span>
            )}
          </div>

          <div className="flex flex-1 items-center justify-center p-6">
            {!running ? (
              <p className="max-w-[220px] text-center font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
                Click &ldquo;Run trace&rdquo; to watch this snippet build a linked list,
                node by node.
              </p>
            ) : (
              <svg viewBox="0 0 360 120" className="h-auto w-full max-w-sm">
                {TRACE_NODES.slice(0, step - 1).map((n, i) => {
                  const next = TRACE_NODES[i + 1];
                  return (
                    <motion.line
                      key={`e-${i}`}
                      x1={n.x + 22}
                      y1={n.y}
                      x2={next.x - 22}
                      y2={next.y}
                      stroke="var(--text-secondary)"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  );
                })}
                {TRACE_NODES.slice(0, step).map((n, i) => (
                  <motion.g
                    key={`n-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <circle cx={n.x} cy={n.y} r={20} fill={n.color} />
                    <text
                      x={n.x}
                      y={n.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily="var(--font-mono)"
                      fontSize={12}
                      fill="var(--bg-base)"
                    >
                      {n.label}
                    </text>
                  </motion.g>
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
