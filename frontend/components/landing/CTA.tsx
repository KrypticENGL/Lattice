"use client";

import { motion } from "framer-motion";
import { scrollToSection } from "@/lib/scroll-to-section";

export default function CTA() {
  return (
    <section className="py-14 sm:py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center"
      >
        <h2 className="text-balance font-serif text-4xl leading-[1.02] font-black tracking-tight text-[var(--text-primary)] wide:text-6xl">
          Bring your code to life.
        </h2>
        <p className="max-w-md font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
          No accounts, no setup. Paste a snippet and watch the exact runtime
          trace draw itself.
        </p>
        <button
          type="button"
          onClick={() => scrollToSection("top")}
          className="mt-2 rounded-full px-7 py-3.5 font-mono text-[13px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_32px_var(--accent-glow)]"
          style={{ background: "var(--accent-primary)" }}
        >
          Open the editor
        </button>
      </motion.div>
    </section>
  );
}
