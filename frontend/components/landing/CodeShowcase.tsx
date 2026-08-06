"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

const CODE_LINES: ReactNode[] = [
  <>
    <span className="text-gruv-orange">class</span>{" "}
    <span className="text-gruv-yellow">Node</span>:
  </>,
  <>
    {"    "}
    <span className="text-gruv-orange">def</span>{" "}
    <span className="text-gruv-yellow">__init__</span>(self, val):
  </>,
  <>
    {"        "}
    <span className="text-gruv-blue">self</span>.val = val
  </>,
  <>
    {"        "}
    <span className="text-gruv-blue">self</span>.next ={" "}
    <span className="text-gruv-orange">None</span>
  </>,
  <>{" "}</>,
  <>
    head = <span className="text-gruv-yellow">Node</span>(
    <span className="text-gruv-purple">3</span>)
  </>,
  <>
    head.next = <span className="text-gruv-yellow">Node</span>(
    <span className="text-gruv-purple">7</span>)
  </>,
  <>
    head.next.next = <span className="text-gruv-yellow">Node</span>(
    <span className="text-gruv-purple">1</span>)
  </>,
  <>
    head.next.next.next = <span className="text-gruv-yellow">Node</span>(
    <span className="text-gruv-purple">9</span>)
  </>,
];

const NODES = [
  { x: 30, y: 60, label: "3", color: "var(--gruv-aqua)" },
  { x: 130, y: 60, label: "7", color: "var(--gruv-blue)" },
  { x: 230, y: 60, label: "1", color: "var(--gruv-orange)" },
  { x: 320, y: 60, label: "9", color: "var(--gruv-purple)" },
];

export default function CodeShowcase() {
  return (
    <section id="trace" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-xl"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-gruvfg">
            Same idea, your own snippet.
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-gruvfg-3">
            Four lines of Python become a diagram you can step through — not
            a generic textbook picture, a trace of the object graph your
            code actually built.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="overflow-hidden rounded-2xl border border-gruvbg-3 bg-gruvbg-1"
          >
            <div className="flex items-center gap-2 border-b border-gruvbg-3 bg-gruvbg-2 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-gruv-red/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-gruv-yellow/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-gruv-green/70" />
              <span className="ml-3 font-mono text-[12px] text-gruvfg-3">
                snippet.py
              </span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-7 text-gruvfg-2">
              {CODE_LINES.map((line, i) => (
                <div key={i} className="flex gap-4">
                  <span className="w-4 shrink-0 select-none text-right text-gruvfg-4">
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
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-gruvbg-3 bg-gruvbg-1"
          >
            <div className="flex items-center justify-between border-b border-gruvbg-3 bg-gruvbg-2 px-4 py-3">
              <span className="font-mono text-[12px] text-gruvfg-3">
                lattice.render() → LinkedList
              </span>
              <span className="rounded-full bg-gruvbg px-2.5 py-1 font-mono text-[11px] text-gruvfg-3">
                step 08/08
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-6">
              <motion.svg
                viewBox="0 0 360 120"
                className="h-auto w-full max-w-sm"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
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
                      stroke="var(--gruvfg-4)"
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
                      fill="var(--gruvbg)"
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
