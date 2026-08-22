"use client";

import { motion } from "framer-motion";
import { scrollToSection } from "@/lib/scroll-to-section";

export default function CTA() {
  return (
    <section className="py-10 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center"
      >
        <h2 className="text-balance font-serif text-3xl leading-[1.05] font-black tracking-tight text-[var(--text-primary)] wide:text-[2.75rem]">
          Bring your code to life.
        </h2>
        <p className="max-w-md font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
          No accounts, no setup. Paste a snippet and watch the exact runtime
          trace draw itself.
        </p>
        <button
          type="button"
          onClick={() => scrollToSection("top")}
          className="mt-1 rounded-full px-6 py-3 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_32px_var(--accent-glow)]"
          style={{ background: "var(--accent-primary)" }}
        >
          Open the editor
        </button>
      </motion.div>
    </section>
  );
}
