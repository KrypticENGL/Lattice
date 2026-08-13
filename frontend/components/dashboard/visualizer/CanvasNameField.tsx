"use client";

import { useEffect, useRef, useState } from "react";

/** Click-to-edit canvas name pill — sits in TraceControls' row, next to
 * the stdout button. Commits on blur/Enter; Escape reverts the draft
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
    if (!editing) setDraft(name ?? "");
  }, [name, editing]);

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
        className="matte w-48 shrink-0 rounded-full px-4 py-2 font-mono text-[12px] font-medium text-[var(--text-primary)] focus:border-[var(--accent-secondary)] focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename canvas"
      className="matte flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-mono text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-secondary)]"
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2l3 3-8 8H3v-3l8-8z" />
      </svg>
      <span className="max-w-[16ch] truncate">{name}</span>
    </button>
  );
}
