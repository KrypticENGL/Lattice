"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import type { ReactNode } from "react";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/dashboard",
    label: "You",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M4.5 20c1.4-3.8 4.4-5.8 7.5-5.8s6.1 2 7.5 5.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/visualizer",
    label: "Visualizer",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M2 12c2.5-4.5 6-6.8 10-6.8s7.5 2.3 10 6.8c-2.5 4.5-6 6.8-10 6.8S4.5 16.5 2 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/canvas",
    label: "Canvas",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="6" cy="7" r="2.1" />
        <circle cx="18" cy="7" r="2.1" />
        <circle cx="12" cy="18" r="2.1" />
        <path d="M7.7 8.6L10.5 16M16.3 8.6L13.5 16M8.1 7h7.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/posts",
    label: "Posts",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 3.5h11l3.5 3.5V20a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
        <path d="M16 3.5V7h3.5" />
        <path d="M8 12h8M8 15.5h8M8 8.5h4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/ai",
    label: "Ask Our AI",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3l1.8 4.6L18.5 9.4 13.8 11.2 12 16l-1.8-4.8L5.5 9.4l4.7-1.8L12 3z" />
        <path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
      </svg>
    ),
  },
];

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="3" fill="var(--accent-secondary)" />
      <circle cx="20" cy="7" r="3" fill="var(--accent-primary)" />
      <circle cx="13" cy="20" r="3" fill="var(--accent-primary)" />
      <path d="M8.5 7.5L17.5 7" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 8.8L12 18" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19 9.5L14.5 18" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();

  return (
    <aside className="matte group fixed top-4 bottom-4 left-4 z-30 flex w-[72px] flex-col justify-between overflow-hidden rounded-[28px] py-5 transition-[width] duration-300 ease-out hover:w-56 sm:top-6 sm:bottom-6 sm:left-6">
      <Link
        href="/"
        aria-label="Lattice home"
        className="flex h-10 items-center gap-2 transition-colors hover:bg-white/5"
      >
        <span className="flex h-10 w-[72px] shrink-0 items-center justify-center">
          <LogoMark />
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap font-serif text-[16px] font-semibold text-[var(--text-primary)] opacity-0 transition-all duration-300 group-hover:max-w-[120px] group-hover:opacity-100">
          Lattice
        </span>
      </Link>

      <nav className="flex flex-col gap-2 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="flex h-11 items-center gap-3 rounded-2xl px-3 transition-colors"
              style={{
                background: active ? "var(--accent-primary)" : "transparent",
                color: active ? "var(--bg-base)" : "var(--text-secondary)",
              }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {item.icon}
              </span>
              <span className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[12px] uppercase tracking-wider opacity-0 transition-all duration-300 group-hover:max-w-[140px] group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex h-10 items-center gap-2">
        <span className="flex h-10 w-[72px] shrink-0 items-center justify-center">
          <UserButton
            appearance={{
              elements: { avatarBox: { width: "32px", height: "32px" } },
            }}
          />
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[12px] text-[var(--text-secondary)] opacity-0 transition-all duration-300 group-hover:max-w-[140px] group-hover:opacity-100">
          {isLoaded ? (user?.firstName ?? "Account") : ""}
        </span>
      </div>
    </aside>
  );
}
