"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

const KEYWORD = "var(--accent-primary)";
const NAME = "var(--accent-secondary)";
const SELF = "#c2703d";
const NUMBER = "#e8993d";

const CODE_LINES: ReactNode[] = [
  <>
    <span style={{ color: KEYWORD }}>class</span>{" "}
    <span style={{ color: NAME }}>Node</span>:
  </>,
  <>
    {"    "}
    <span style={{ color: KEYWORD }}>def</span>{" "}
    <span style={{ color: NAME }}>__init__</span>(self, val):
  </>,
  <>
    {"        "}
    <span style={{ color: SELF }}>self</span>.val = val
  </>,
  <>
    {"        "}
    <span style={{ color: SELF }}>self</span>.next ={" "}
    <span style={{ color: KEYWORD }}>None</span>
  </>,
  <>{" "}</>,
  <>
    head = <span style={{ color: NAME }}>Node</span>(
    <span style={{ color: NUMBER }}>3</span>)
  </>,
  <>
    head.next = <span style={{ color: NAME }}>Node</span>(
    <span style={{ color: NUMBER }}>7</span>)
  </>,
  <>
    head.next.next = <span style={{ color: NAME }}>Node</span>(
    <span style={{ color: NUMBER }}>1</span>)
  </>,
  <>
    head.next.next.next = <span style={{ color: NAME }}>Node</span>(
    <span style={{ color: NUMBER }}>9</span>)
  </>,
];

const NODES = [
  { x: 30, y: 60, label: "3", color: "var(--accent-secondary)" },
  { x: 130, y: 60, label: "7", color: "#c2703d" },
  { x: 230, y: 60, label: "1", color: "#e8993d" },
  { x: 320, y: 60, label: "9", color: "var(--accent-primary)" },
];

export default function CodeShowcase() {
  return (
    <section
      id="trace"
      className="flex min-h-full flex-col justify-center py-12 sm:py-20"
    >
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Trace schema
          </span>
          <h2 className="text-balance mt-3 font-serif text-4xl leading-[1.02] font-black tracking-tight text-[var(--text-primary)] wide:text-5xl">
            Same idea, your own snippet.
          </h2>
          <p className="mt-4 max-w-xl font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
            Four lines of Python become a diagram you can step through — not
            a generic textbook picture, a trace of the object graph your
            code actually built.
          </p>
        </motion.div>

        <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5 }}
            className="glass overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/70" />
              <span className="ml-3 font-mono text-[12px] text-[var(--text-secondary)]">
                snippet.py
              </span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-7 text-[var(--text-primary)]">
              {CODE_LINES.map((line, i) => (
                <div key={i} className="flex gap-4">
                  <span className="w-4 shrink-0 select-none text-right text-[var(--text-secondary)]">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </div>
              ))}
            </pre>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass flex flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
              <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                lattice.render() → LinkedList
              </span>
              <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                step 08/08
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-6">
              <motion.svg
                viewBox="0 0 360 120"
                className="h-auto w-full max-w-sm"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-30px" }}
              >
                {NODES.slice(0, -1).map((n, i) => {
                  const next = NODES[i + 1];
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
                      variants={{
                        hidden: { pathLength: 0, opacity: 0 },
                        visible: {
                          pathLength: 1,
                          opacity: 1,
                          transition: { duration: 0.4, delay: 0.3 + i * 0.22 },
                        },
                      }}
                    />
                  );
                })}
                {NODES.map((n, i) => (
                  <motion.g
                    key={`n-${i}`}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.35, delay: i * 0.22 },
                      },
                    }}
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
              </motion.svg>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
