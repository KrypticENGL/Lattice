"use client";

import { motion } from "framer-motion";
import HeroVisual from "./HeroVisual";

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-6 pt-16 pb-20 sm:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--gruvbg-3) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-gruvbg-3 bg-gruvbg-1 px-3 py-1 font-mono text-[12px] text-gruvfg-3"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gruv-aqua" />
            runtime-trace visualizer
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-gruvfg sm:text-5xl"
          >
            Watch your code
            <br />
            build its own{" "}
            <span className="text-gruv-aqua">data structures.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-5 max-w-lg text-[16px] leading-7 text-gruvfg-3"
          >
            Paste a snippet. Lattice runs it for real inside a sandbox,
            captures a step-by-step memory trace, and replays it as an
            animated diagram — accurate to your exact code, bugs and all.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="#trace"
              className="rounded-md bg-gruvfg px-5 py-2.5 text-[14px] font-medium text-gruvbg transition-colors hover:bg-gruv-aqua"
            >
              Try a live snippet
            </a>
            <a
              href="#how-it-works"
              className="rounded-md border border-gruvbg-3 px-5 py-2.5 text-[14px] font-medium text-gruvfg-2 transition-colors hover:border-gruv-aqua hover:text-gruv-aqua"
            >
              See how it works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 flex items-center gap-6 font-mono text-[12px] text-gruvfg-4"
          >
            <span>python</span>
            <span className="text-gruvbg-4">/</span>
            <span>javascript</span>
            <span className="text-gruvbg-4">/</span>
            <span>sandboxed · zero network</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <HeroVisual />
        </motion.div>
      </div>
    </section>
  );
}
