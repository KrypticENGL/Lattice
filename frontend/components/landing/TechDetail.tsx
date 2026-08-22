"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { BRAND_LOGOS } from "./tech-logos";

export type DetailItem = {
  name: string;
  group: string;
  role: string;
  detail: string;
  /** The section's stylised glyph, used where there is no brand mark. */
  fallback: ReactNode;
};

/**
 * The panel a technology opens into.
 *
 * Rendered through a portal, deliberately: the stack section lives
 * inside the landing page's scroll container, and anything absolutely
 * positioned in there can add to its scrollable overflow. Grow that
 * container past one screen per panel and `ScrollFrame.shouldSnap()`
 * turns snapping off for the entire deck. A portal to `document.body`
 * puts the panel outside that measurement altogether.
 *
 * No `backdrop-filter` on the scrim, for the reason the rest of this
 * page no longer has one either.
 */
export default function TechDetail({
  item,
  onClose,
}: {
  item: DetailItem | null;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!item) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreFocus.current?.focus?.();
    };
  }, [item, onClose]);

  if (typeof document === "undefined") return null;

  const logo = item ? BRAND_LOGOS[item.name] : undefined;
  const tint = logo ? logo.hex : "var(--accent-secondary)";
  const mark = logo?.onDark ?? tint;

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.18 }}
        >
          <div
            aria-hidden="true"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(0,0,0,0.66)]"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={item.name}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
            transition={{
              duration: reduceMotion ? 0.1 : 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="tech-card relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl outline-none sm:flex-row"
          >
            {/* The quarter that carries the mark. Tinted with the brand's
                own colour so the panel takes on the technology's identity
                rather than the page's. */}
            <div
              className="flex shrink-0 items-center justify-center border-b border-[var(--hairline)] py-7 sm:w-1/4 sm:border-r sm:border-b-0 sm:py-0"
              style={{
                background: `color-mix(in srgb, ${tint} 13%, var(--bg-surface))`,
              }}
            >
              {logo ? (
                <svg
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label={`${logo.title} logo`}
                  className="h-14 w-14"
                  style={{ fill: mark }}
                >
                  <path d={logo.path} />
                </svg>
              ) : (
                // No registered brand mark for this one; the section's own
                // glyph stands in rather than inventing a logo.
                <span
                  className="flex h-14 w-14 items-center justify-center"
                  style={{ color: "var(--accent-secondary)" }}
                >
                  {item.fallback}
                </span>
              )}
            </div>

            <div className="relative flex-1 p-5 sm:p-6">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)]"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 1l10 10M11 1L1 11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--text-secondary)] uppercase">
                {item.group}
              </span>
              <h3 className="mt-1.5 pr-8 font-serif text-[22px] leading-tight font-bold text-[var(--text-primary)]">
                {item.name}
              </h3>
              {/* Only the long form here. The `role` line is what the
                  hover card says, and every `detail` was written to open
                  on the same point — printing both put two near-identical
                  sentences one above the other. */}
              <p className="mt-3 text-[13px] leading-[1.7] text-[var(--text-secondary)]">
                {item.detail}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
