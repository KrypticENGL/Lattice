"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useWideViewport } from "@/lib/use-wide-viewport";

const ELSEWHERE = [
  { href: "/dashboard", label: "Your dashboard" },
  { href: "/dashboard/posts", label: "Posts" },
  { href: "/dashboard/saved", label: "Saved posts" },
  { href: "/dashboard/ai", label: "Ask our AI" },
];

/**
 * Restricts a canvas workspace (Visualizer, Code-Canvas, Simulator) to
 * viewports that can actually hold one, and explains itself on the ones
 * that can't.
 *
 * Two mechanisms, on purpose, because neither is sufficient alone:
 *
 *  - **CSS** (the `wide:` variant) decides what is *visible*. It is right
 *    on the first paint, on the server as well as the client, so nobody
 *    ever sees a flash of the wrong thing — and it re-evaluates instantly
 *    when the window is resized or the page is zoomed.
 *
 *  - **JS** (`useWideViewport`) decides what is *mounted*. A hidden
 *    workspace is still a live Monaco editor, a `requestAnimationFrame`
 *    loop and a poll or two; unmounting it on a phone stops all of that.
 *    It settles one tick after hydration, behind the CSS, so its lag is
 *    never visible.
 */
export default function WorkspaceGate({
  feature,
  children,
}: {
  /** Name of the workspace, used in the small-screen message. */
  feature: string;
  children: ReactNode;
}) {
  const wide = useWideViewport();

  return (
    <>
      <div className="hidden h-full wide:block">{wide ? children : null}</div>

      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-16 text-center wide:hidden">
        <div
          className="matte flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ color: "var(--accent-secondary)" }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
            <path d="M9 20.5h6" />
          </svg>
        </div>

        <div className="max-w-md">
          <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            {feature}
          </span>
          <h1 className="text-balance mt-3 font-serif text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Needs a bigger canvas.
          </h1>
          <p className="mt-4 font-serif text-[15px] leading-7 text-[var(--text-secondary)]">
            {feature} is a drag-and-drop workspace — a diagram, a code editor
            and a block palette side by side. It opens on a tablet or a
            desktop. If you&rsquo;re already on one, widen the window or dial
            the page zoom back down and it&rsquo;ll come straight back.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {ELSEWHERE.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="matte rounded-full px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
