"use client";

import { motion } from "framer-motion";
import HeroVisual from "./HeroVisual";
import { scrollToSection } from "@/lib/scroll-to-section";

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-full items-center overflow-hidden py-8 sm:py-12"
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

      <div className="mx-auto grid w-full max-w-5xl items-center gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            // Sized off both axes at once rather than through breakpoints.
            // A width-only scale gives a landscape phone (780x380) the
            // same display size as a laptop, because it is nearly as wide
            // and a fifth as tall; taking the smaller of the two keeps the
            // headline proportional to the space that actually exists.
            // It also degrades correctly under browser zoom, which shrinks
            // both viewport axes together.
            //
            // The ceiling is deliberately well below what the width alone
            // would allow. At 100% zoom on an ordinary laptop the old cap
            // let the headline, its paragraph, the buttons and the language
            // strip add up to more than one panel — and an overflowing
            // panel doesn't just look cramped, it switches the deck out of
            // snapping altogether (see `shouldSnap` in ScrollFrame).
            className="text-balance font-serif text-[clamp(2rem,min(6.6vw,10vh),4rem)] leading-[0.98] font-black tracking-tight text-[var(--text-primary)]"
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
            className="mt-5 max-w-lg font-serif text-[17px] leading-7 text-[var(--text-secondary)]"
          >
            Paste a snippet. Lattice runs it for real inside a sandbox,
            captures a step-by-step memory trace, and replays it as an
            animated diagram — accurate to your exact code, bugs and all.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => scrollToSection("trace")}
              className="rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_28px_var(--accent-glow)]"
              style={{ background: "var(--accent-primary)" }}
            >
              Try a live snippet
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("how-it-works")}
              className="glass rounded-full px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
            >
              See how it works
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]"
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
