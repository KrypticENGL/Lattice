"use client";

import { scrollToSection } from "@/lib/scroll-to-section";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--hairline)] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-serif text-[15px] font-bold text-[var(--text-primary)]">
            Lattice
          </span>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            — trace first, visualize second.
          </span>
        </div>
        <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
          <button type="button" onClick={() => scrollToSection("how-it-works")} className="hover:text-[var(--accent-secondary)]">
            How it works
          </button>
          <button type="button" onClick={() => scrollToSection("features")} className="hover:text-[var(--accent-secondary)]">
            Features
          </button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--accent-secondary)]"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
