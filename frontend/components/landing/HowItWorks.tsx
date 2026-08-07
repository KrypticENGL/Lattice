"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    n: "01",
    title: "Write your snippet",
    body: "Drop a Python or JavaScript snippet into the editor — a linked list build, a BFS, a hash map insert. Whatever you want to see.",
  },
  {
    n: "02",
    title: "It actually runs",
    body: "A real interpreter executes your code inside a locked-down, network-less sandbox, single-stepping and recording every memory mutation.",
  },
  {
    n: "03",
    title: "Watch the trace replay",
    body: "The exact sequence of allocations and pointer changes comes back as an animated diagram you can step through, scrub, or autoplay.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="flex h-full flex-col justify-center px-6 pt-24 pb-10 sm:px-10 sm:pt-28"
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
            How it works
          </span>
          <h2 className="text-balance mt-3 font-serif text-4xl leading-[1.02] font-black tracking-tight text-[var(--text-primary)] sm:text-6xl">
            Trace first, visualize second.
          </h2>
          <p className="mt-4 max-w-xl font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
            No hand-written simulation of &ldquo;how a linked list works.&rdquo;
            The picture comes from a real execution, so it&rsquo;s accurate to
            whatever you actually wrote.
          </p>
        </motion.div>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute top-7 left-0 hidden h-px w-full bg-[var(--hairline-strong)] sm:block"
          />
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative"
            >
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--hairline-strong)] bg-[var(--bg-base)] font-serif text-[17px] font-bold text-[var(--accent-secondary)]">
                {step.n}
              </div>
              <h3 className="mt-5 font-serif text-[20px] font-bold text-[var(--text-primary)]">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-6 text-[var(--text-secondary)]">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
