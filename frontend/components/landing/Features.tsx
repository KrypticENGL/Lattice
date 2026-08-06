"use client";

import { motion } from "framer-motion";

const FEATURES = [
  {
    title: "Real runtime, not simulation",
    body: "Your snippet runs under a real interpreter's trace hooks. What you see is what actually happened — including your bugs.",
    color: "var(--gruv-aqua)",
    icon: (
      <path
        d="M4 3l5 5-5 5M11 13h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Language-agnostic trace",
    body: "Every tracer emits the same JSON schema. New languages plug into the same visualizer with zero frontend changes.",
    color: "var(--gruv-blue)",
    icon: (
      <path
        d="M3 8h12M3 4h12M3 12h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: "Sandboxed & isolated",
    body: "No network, read-only filesystem, capped CPU and memory. Untrusted code never touches your infrastructure.",
    color: "var(--gruv-orange)",
    icon: (
      <path
        d="M8 2l5 2v4c0 4-2.5 5.6-5 6.5C5.5 13.6 3 12 3 8V4l5-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Step-by-step playback",
    body: "Scrub back and forth through the exact moment a pointer changed. Every step is a full, self-contained snapshot.",
    color: "var(--gruv-purple)",
    icon: (
      <path
        d="M3 4v8l5-4-5-4zM10 4v8l5-4-5-4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="border-t border-gruvbg-3 bg-gruvbg-1 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-lg text-3xl font-semibold tracking-tight text-gruvfg"
        >
          Built for accuracy, not approximation.
        </motion.h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              whileHover={{ y: -3 }}
              className="rounded-xl border border-gruvbg-3 bg-gruvbg p-5"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  color: f.color,
                  backgroundColor: "var(--gruvbg-2)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  {f.icon}
                </svg>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-gruvfg">
                {f.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-6 text-gruvfg-3">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
