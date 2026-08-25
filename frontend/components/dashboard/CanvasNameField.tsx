"use client";

import { useEffect, useRef, useState } from "react";

/** Click-to-edit name pill, shared by the Visualizer's canvases and
 * Code-Canvas's graphs. Commits on blur/Enter; Escape reverts the draft
 * without saving. */
export default function CanvasNameField({
  name,
  onRename,
}: {
  name: string | undefined;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (name === undefined) return null;

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name ?? "");
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(name ?? "");
            setEditing(false);
          }
        }}
        className="rail-pill glass-flat w-44 shrink-0 rounded-full px-3 font-mono text-[11px] font-medium text-[var(--text-primary)] focus:border-[var(--accent-secondary)] focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      // The draft is seeded here rather than kept in sync with `name` by an
      // effect: it only exists while editing, so the moment editing starts
      // is the only moment it needs a value.
      onClick={() => {
        setDraft(name ?? "");
        setEditing(true);
      }}
      title="Rename canvas"
      className="rail-pill glass-flat flex shrink-0 gap-1.5 rounded-full px-3 font-mono text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2l3 3-8 8H3v-3l8-8z" />
      </svg>
      <span className="max-w-[16ch] truncate">{name}</span>
    </button>
  );
}
