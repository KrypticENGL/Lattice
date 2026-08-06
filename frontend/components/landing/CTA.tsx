"use client";

import { motion } from "framer-motion";

export default function CTA() {
  return (
    <section className="border-t border-gruvbg-3 bg-gruvbg-2 px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-gruvfg sm:text-4xl">
          Bring your code to life.
        </h2>
        <p className="max-w-md text-[15px] leading-7 text-gruvfg-3">
          No accounts, no setup. Paste a snippet and watch the exact runtime
          trace draw itself.
        </p>
        <a
          href="#top"
          className="mt-2 rounded-md bg-gruvfg px-6 py-3 text-[14px] font-medium text-gruvbg transition-colors hover:bg-gruv-aqua"
        >
          Open the editor
        </a>
      </motion.div>
    </section>
  );
}
