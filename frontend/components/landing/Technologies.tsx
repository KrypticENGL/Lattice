"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  nextjs: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 8v8M8.5 8l7 8M15.5 8v3.5" />
    </svg>
  ),
  react: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </svg>
  ),
  typescript: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7 8.5h5M9.5 8.5V16" />
      <path d="M14 15.3c.3.8 1.1 1.2 2 1 .9-.2 1.4-1.1.6-1.7-.8-.6-2.4-.6-2.6-1.6-.2-1 .8-1.6 1.8-1.4.7.1 1.1.5 1.3 1" />
    </svg>
  ),
  tailwind: (
    <svg {...ICON_PROPS}>
      <path d="M4 9.5c1.4-3 3.4-3 5-1.5 1.6 1.5 3 1.5 4.4 0 1.6-1.5 3.6-1.5 5 1.5" />
      <path d="M4 15c1.4-3 3.4-3 5-1.5 1.6 1.5 3 1.5 4.4 0 1.6-1.5 3.6-1.5 5 1.5" />
    </svg>
  ),
  monaco: (
    <svg {...ICON_PROPS}>
      <path d="M9 6.5l-5 5.5 5 5.5M15 6.5l5 5.5-5 5.5" />
    </svg>
  ),
  reactflow: (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="7" r="2.1" />
      <circle cx="18" cy="7" r="2.1" />
      <circle cx="12" cy="18" r="2.1" />
      <path d="M7.7 8.6L10.5 16M16.3 8.6L13.5 16" />
    </svg>
  ),
  d3: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M12 7v4M12 11l-5 5M12 11l5 5" />
    </svg>
  ),
  framer: (
    <svg {...ICON_PROPS}>
      <path d="M6 4h12v5.5H12" />
      <path d="M6 9.5h6v5.5" />
      <path d="M6 15h6l6 6H12v-6z" />
    </svg>
  ),
  rust: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.2" strokeDasharray="1.4 2.2" />
    </svg>
  ),
  tokio: (
    <svg {...ICON_PROPS}>
      <path d="M5 12a7 7 0 0 1 12-4.9" />
      <path d="M17 4.5v3.4h-3.4" />
      <path d="M19 12a7 7 0 0 1-12 4.9" />
      <path d="M7 19.5v-3.4h3.4" />
    </svg>
  ),
  axum: (
    <svg {...ICON_PROPS}>
      <path d="M4 20V11a8 8 0 0 1 16 0v9" />
      <path d="M4 20h16" />
    </svg>
  ),
  serde: (
    <svg {...ICON_PROPS}>
      <path d="M9.5 4.5c-2 0-2.8 1-2.8 2.7v2.4c0 1.1-.6 1.9-1.9 1.9 1.3 0 1.9.8 1.9 1.9v2.4c0 1.7.8 2.7 2.8 2.7" />
      <path d="M14.5 4.5c2 0 2.8 1 2.8 2.7v2.4c0 1.1.6 1.9 1.9 1.9-1.3 0-1.9.8-1.9 1.9v2.4c0 1.7-.8 2.7-2.8 2.7" />
    </svg>
  ),
  bollard: (
    <svg {...ICON_PROPS}>
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8M4 8l8 4 8-4" />
    </svg>
  ),
  tracing: (
    <svg {...ICON_PROPS}>
      <path d="M2.5 13c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0" />
    </svg>
  ),
  docker: (
    <svg {...ICON_PROPS}>
      <path d="M3 13h18c0 3.5-3.1 6.5-9 6.5S3 16.5 3 13z" />
      <rect x="5.2" y="9.2" width="3" height="3" />
      <rect x="9.2" y="9.2" width="3" height="3" />
      <rect x="13.2" y="9.2" width="3" height="3" />
      <rect x="9.2" y="5.2" width="3" height="3" />
    </svg>
  ),
  gvisor: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5l6.5 2.7v5.3c0 4.4-2.7 7.1-6.5 8-3.8-.9-6.5-3.6-6.5-8V6.2L12 3.5z" />
    </svg>
  ),
  redis: (
    <svg {...ICON_PROPS}>
      <path d="M12 4.5l7.5 3-7.5 3-7.5-3 7.5-3z" />
      <path d="M4.5 11.5l7.5 3 7.5-3" />
      <path d="M4.5 15.5l7.5 3 7.5-3" />
    </svg>
  ),
  postgres: (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="6.5" rx="6.8" ry="2.4" />
      <path d="M5.2 6.5v11c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4v-11" />
      <path d="M5.2 12c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4" />
    </svg>
  ),
  python: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.2c-3.2 0-4.3 1-4.3 3.3v2.2h4.3" />
      <path d="M7.7 8.7H4.9c-1.6 0-2.2 1.1-2.2 2.8s.6 2.8 2.2 2.8h3.4" />
      <circle cx="9.1" cy="5.6" r=".55" fill="currentColor" stroke="none" />
      <path d="M12 20.8c3.2 0 4.3-1 4.3-3.3v-2.2h-4.3" />
      <path d="M16.3 15.3h2.8c1.6 0 2.2-1.1 2.2-2.8s-.6-2.8-2.2-2.8h-3.4" />
      <circle cx="14.9" cy="18.4" r=".55" fill="currentColor" stroke="none" />
    </svg>
  ),
  babel: (
    <svg {...ICON_PROPS}>
      <path d="M3.5 8.5h9M12.5 8.5l-3-3M12.5 8.5l-3 3" />
      <path d="M20.5 15.5h-9M11.5 15.5l3-3M11.5 15.5l3 3" />
    </svg>
  ),
};

const STACK: { group: string; items: { name: string; icon: keyof typeof ICONS }[] }[] = [
  {
    group: "Frontend",
    items: [
      { name: "Next.js 16", icon: "nextjs" },
      { name: "React 19", icon: "react" },
      { name: "TypeScript", icon: "typescript" },
      { name: "Tailwind CSS v4", icon: "tailwind" },
      { name: "Monaco Editor", icon: "monaco" },
      { name: "React Flow", icon: "reactflow" },
      { name: "d3-hierarchy", icon: "d3" },
      { name: "Framer Motion", icon: "framer" },
    ],
  },
  {
    group: "Backend",
    items: [
      { name: "Rust", icon: "rust" },
      { name: "Tokio", icon: "tokio" },
      { name: "Axum 0.8", icon: "axum" },
      { name: "serde / serde_json", icon: "serde" },
      { name: "bollard", icon: "bollard" },
      { name: "tracing", icon: "tracing" },
    ],
  },
  {
    group: "Sandbox & infra",
    items: [
      { name: "Docker", icon: "docker" },
      { name: "gVisor (runsc)", icon: "gvisor" },
      { name: "Redis", icon: "redis" },
      { name: "Postgres (sqlx)", icon: "postgres" },
    ],
  },
  {
    group: "Tracers",
    items: [
      { name: "Python sys.settrace", icon: "python" },
      { name: "Babel / SWC", icon: "babel" },
    ],
  },
];

export default function Technologies() {
  return (
    <section
      id="technologies"
      className="flex h-full flex-col justify-center py-16 sm:py-20"
    >
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            Technologies
          </span>
          <h2 className="text-balance mt-3 font-serif text-4xl leading-[1.02] font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
            The stack underneath.
          </h2>
          <p className="mt-4 max-w-xl font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
            A real interpreter, a locked-down sandbox, and a language-agnostic
            trace schema — the stack that makes &ldquo;trace first, visualize
            second&rdquo; possible.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STACK.map((group, i) => (
            <motion.div
              key={group.group}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
            >
              <h3 className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--text-secondary)] uppercase">
                {group.group}
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="glass flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[var(--text-primary)]"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center"
                      style={{ color: "var(--accent-secondary)" }}
                    >
                      {ICONS[item.icon]}
                    </span>
                    <span className="font-mono text-[12px]">{item.name}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
