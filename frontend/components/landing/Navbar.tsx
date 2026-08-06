"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#trace", label: "Trace schema" },
];

function LogoMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" fill="var(--gruv-aqua)" />
      <circle cx="20" cy="7" r="3" fill="var(--gruv-orange)" />
      <circle cx="13" cy="20" r="3" fill="var(--gruv-blue)" />
      <path
        d="M8.5 7.5L17.5 7"
        stroke="var(--gruvfg-3)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M7 8.8L12 18"
        stroke="var(--gruvfg-3)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M19 9.5L14.5 18"
        stroke="var(--gruvfg-3)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isSignedIn, isLoaded } = useUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gruvbg-3 bg-gruvbg/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <a href="#top" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-mono text-[17px] font-semibold tracking-tight text-gruvfg">
              Lattice
            </span>
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md border border-gruvbg-3 px-3 py-1.5 text-[13px] font-medium text-gruvfg-2 transition-colors hover:border-gruv-aqua hover:text-gruv-aqua md:inline-flex md:items-center md:justify-center"
          >
            Visit GitHub
          </a>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[14px] text-gruvfg-2 transition-colors hover:text-gruv-aqua"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          {isLoaded && (
            isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-md border border-gruvbg-3 px-4 py-2 text-[14px] font-medium text-gruvfg transition-colors hover:border-gruv-aqua hover:text-gruv-aqua"
                >
                  Sign in / Sign up
                </button>
              </SignInButton>
            )
          )}
          <a
            href="#trace"
            className="rounded-md bg-gruvfg px-4 py-2 text-[14px] font-medium text-gruvbg transition-colors hover:bg-gruv-aqua"
          >
            Try it live
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-gruvbg-3 text-gruvfg md:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            {open ? (
              <path
                d="M2 2L14 14M14 2L2 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M2 4H14M2 8H14M2 12H14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
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
            className="overflow-hidden border-b border-gruvbg-3 bg-gruvbg md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2.5 text-[15px] text-gruvfg-2 hover:bg-gruvbg-2 hover:text-gruv-aqua"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center rounded-md border border-gruvbg-3 px-2 py-2.5 text-[15px] font-medium text-gruvfg-2 hover:border-gruv-aqua hover:text-gruv-aqua"
              >
                Visit GitHub
              </a>
              {isLoaded && (
                isSignedIn ? (
                  <div className="mt-2 flex items-center gap-2 px-2 py-1.5">
                    <UserButton />
                  </div>
                ) : (
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="mt-2 rounded-md border border-gruvbg-3 px-4 py-2.5 text-center text-[15px] font-medium text-gruvfg hover:border-gruv-aqua hover:text-gruv-aqua"
                    >
                      Sign in / Sign up
                    </button>
                  </SignInButton>
                )
              )}
              <a
                href="#trace"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-md bg-gruvfg px-4 py-2.5 text-center text-[15px] font-medium text-gruvbg"
              >
                Try it live
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
