"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EDGE_STYLE_STORAGE_KEY, isEdgeStyle, type EdgeStyle } from "./edge-style";

const DEFAULT_STYLE: EdgeStyle = "curved";

/**
 * The chosen edge routing, read from and written to browser storage.
 *
 * `useSyncExternalStore` rather than `useState` + an effect that reads
 * storage on mount. Two reasons, and they pull in opposite directions
 * otherwise: the value has to be the default on the server (there is no
 * storage there, and rendering the stored one would hydrate into a
 * mismatch on the very control that displays it), and this project's lint
 * forbids the setState-in-an-effect that would normally reconcile the two
 * afterwards. Storage genuinely *is* an external store, so the hook built
 * for external stores is the honest answer rather than a way around a
 * rule.
 *
 * The `storage` event subscription is what that buys on top: the same
 * canvas open in two tabs keeps one setting between them.
 */

let cached: EdgeStyle | null = null;
const listeners = new Set<() => void>();

function readStored(): EdgeStyle {
  // getSnapshot is called on every render and must return a stable value,
  // so the read is cached rather than hitting storage each time. The cache
  // is only ever invalidated by a write, ours or another tab's.
  if (cached !== null) return cached;
  try {
    const saved = window.localStorage.getItem(EDGE_STYLE_STORAGE_KEY);
    cached = isEdgeStyle(saved) ? saved : DEFAULT_STYLE;
  } catch {
    // Storage unavailable (private mode) — the default is fine, and
    // caching it stops every render from retrying a throwing call.
    cached = DEFAULT_STYLE;
  }
  return cached;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== EDGE_STYLE_STORAGE_KEY) return;
    cached = null;
    for (const listener of listeners) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useEdgeStyle(): [EdgeStyle, (next: EdgeStyle) => void] {
  const style = useSyncExternalStore(subscribe, readStored, () => DEFAULT_STYLE);

  const setStyle = useCallback((next: EdgeStyle) => {
    cached = next;
    try {
      window.localStorage.setItem(EDGE_STYLE_STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is no reason to refuse it —
      // `cached` above already made it take effect for this session.
    }
    for (const listener of listeners) listener();
  }, []);

  return [style, setStyle];
}
