import type { ReactNode } from "react";

export default function ComingSoon({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-2 py-12 text-center sm:px-6 sm:py-16">
      <div
        className="matte flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ color: "var(--accent-secondary)" }}
      >
        <span className="flex h-7 w-7 items-center justify-center">{icon}</span>
      </div>

      <div className="max-w-md">
        <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          {eyebrow}
        </span>
        <h1 className="text-balance mt-3 font-serif text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 font-serif text-[16px] leading-7 text-[var(--text-secondary)]">
          {description}
        </p>
      </div>

      <span className="matte rounded-full px-4 py-1.5 font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)]">
        In active development
      </span>
    </div>
  );
}
