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
    <section id="how-it-works" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-xl"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-gruvfg">
            Trace first, visualize second.
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-gruvfg-3">
            No hand-written simulation of &ldquo;how a linked list works.&rdquo;
            The picture comes from a real execution, so it&rsquo;s accurate to
            whatever you actually wrote.
          </p>
        </motion.div>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute top-6 left-0 hidden h-px w-full bg-gruvbg-3 sm:block"
          />
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative"
            >
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-gruvbg-3 bg-gruvbg font-mono text-[13px] text-gruv-aqua">
                {step.n}
              </div>
              <h3 className="mt-5 text-[17px] font-semibold text-gruvfg">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-6 text-gruvfg-3">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
