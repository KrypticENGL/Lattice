"use client";

import { motion } from "framer-motion";
import HeroVisual from "./HeroVisual";
import { scrollToSection } from "@/lib/scroll-to-section";

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex h-full items-center overflow-hidden px-6 pt-24 pb-10 sm:px-10 sm:pt-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--hairline-strong) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(circle at 30% 30%, black, transparent 75%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent-secondary)" }}
            />
            Runtime-trace visualizer
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="text-balance mt-6 font-serif text-[13vw] leading-[0.95] font-black tracking-tight text-[var(--text-primary)] sm:text-6xl lg:text-[5.2rem]"
          >
            Watch your code
            <br />
            build its own{" "}
            <span style={{ color: "var(--accent-primary)" }}>
              data structures.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-6 max-w-lg font-serif text-[17px] leading-7 text-[var(--text-secondary)]"
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
            <button
              type="button"
              onClick={() => scrollToSection("trace")}
              className="rounded-full px-6 py-3 font-mono text-[13px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_28px_var(--accent-glow)]"
              style={{ background: "var(--accent-primary)" }}
            >
              Try a live snippet
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("how-it-works")}
              className="glass rounded-full px-6 py-3 font-mono text-[13px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
            >
              See how it works
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-9 flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <span>python</span>
            <span className="opacity-40">/</span>
            <span>javascript</span>
            <span className="opacity-40">/</span>
            <span>sandboxed · zero network</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden lg:block"
        >
          <HeroVisual />
        </motion.div>
      </div>
    </section>
  );
}
