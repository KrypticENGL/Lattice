"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { scrollToSection } from "@/lib/scroll-to-section";

const LINKS = [
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "trace", label: "Trace schema" },
];

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="3" fill="var(--accent-secondary)" />
      <circle cx="20" cy="7" r="3" fill="var(--accent-primary)" />
      <circle cx="13" cy="20" r="3" fill="var(--accent-primary)" />
      <path d="M8.5 7.5L17.5 7" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 8.8L12 18" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19 9.5L14.5 18" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isSignedIn, isLoaded } = useUser();

  const primaryHref = isSignedIn ? "/dashboard" : undefined;
  const primaryLabel = isSignedIn ? "Workstation" : "Try it live";

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-3 sm:top-6 sm:px-6">
      <nav className="glass-nav flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-2.5 sm:px-7">
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={() => scrollToSection("top")}
            className="flex items-center gap-2"
          >
            <LogoMark />
            <span className="font-serif text-[19px] font-semibold tracking-tight text-[var(--text-primary)]">
              Lattice
            </span>
          </button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-white/15 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] md:inline-flex md:items-center md:justify-center"
          >
            GitHub
          </a>
        </div>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToSection(link.id)}
              className="font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-secondary)]"
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {isLoaded &&
            (isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-white/15 px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)]"
                >
                  Sign in
                </button>
              </SignInButton>
            ))}
          {primaryHref ? (
            <a
              href={primaryHref}
              className="rounded-full px-5 py-2 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow"
              style={{
                background: "var(--accent-primary)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
              }}
            >
              {primaryLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => scrollToSection("trace")}
              className="rounded-full px-5 py-2 font-mono text-[12px] font-medium uppercase tracking-wider text-[var(--bg-base)] transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)]"
              style={{ background: "var(--accent-primary)" }}
            >
              {primaryLabel}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-[var(--text-primary)] md:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            {open ? (
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="glass-nav absolute top-[calc(100%+10px)] left-3 right-3 overflow-hidden rounded-3xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    scrollToSection(link.id);
                  }}
                  className="rounded-xl px-3 py-2.5 text-left font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--accent-secondary)]"
                >
                  {link.label}
                </button>
              ))}
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
              >
                GitHub
              </a>
              {isLoaded &&
                (isSignedIn ? (
                  <div className="mt-2 flex items-center gap-2 px-3 py-1.5">
                    <UserButton />
                  </div>
                ) : (
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="mt-2 rounded-xl border border-white/15 px-4 py-2.5 text-center font-mono text-[13px] uppercase tracking-wider text-[var(--text-primary)]"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                ))}
              {primaryHref ? (
                <a
                  href={primaryHref}
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-xl px-4 py-2.5 text-center font-mono text-[13px] font-medium uppercase tracking-wider text-[var(--bg-base)]"
                  style={{ background: "var(--accent-primary)" }}
                >
                  {primaryLabel}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    scrollToSection("trace");
                  }}
                  className="mt-2 rounded-xl px-4 py-2.5 text-center font-mono text-[13px] font-medium uppercase tracking-wider text-[var(--bg-base)]"
                  style={{ background: "var(--accent-primary)" }}
                >
                  {primaryLabel}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
