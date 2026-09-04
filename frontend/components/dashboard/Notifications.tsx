"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getNotifications, type NotificationItem } from "@/lib/dashboard-data";
import { relativeTime } from "@/lib/relative-time";

export default function Notifications() {
  const { getToken, isSignedIn } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        const rows = await getNotifications(token);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load notifications.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  return (
    // `h-full min-h-0` so it can absorb whatever the sidebar has left over
    // once the Resource Monitor has taken its (fixed) share, and shrink
    // instead of overflowing when that is not much.
    <div className="matte flex h-full min-h-0 flex-col rounded-2xl p-3.5">
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className="font-serif text-[15px] font-bold text-[var(--text-primary)]">
          Notifications
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-secondary)]">
          {items ? `${items.length} new` : ""}
        </span>
      </div>

      {/* The list scrolls within whatever height it is given, rather than
        * standing at a fixed 440px the page then has to find room for. */}
      <ul className="scrollbar-thin mt-3 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1">
        {!items && !error && (
          <li className="flex flex-1 items-center justify-center font-mono text-[12px] text-[var(--text-secondary)]">
            Loading…
          </li>
        )}
        {error && (
          <li className="flex flex-1 items-center justify-center font-mono text-[12px] text-[var(--text-secondary)]">
            {error}
          </li>
        )}
        {items && items.length === 0 && (
          <li className="flex flex-1 items-center justify-center text-center font-serif text-[12.5px] text-[var(--text-secondary)]">
            No comments on your posts yet.
          </li>
        )}
        {items?.map((n) => (
          <li
            key={n.id}
            className="border-t border-[var(--hairline)] py-4 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                style={{ background: "var(--bg-elevated)", color: "var(--accent-secondary)" }}
              >
                {n.author.charAt(0)}
              </span>
              <p className="text-[12.5px] leading-5 text-[var(--text-primary)]">
                <span className="font-semibold">{n.author}</span>{" "}
                <span className="text-[var(--text-secondary)]">commented on</span>{" "}
                <span className="font-semibold">{n.postTitle}</span>
              </p>
            </div>
            <p className="mt-1.5 pl-[34px] font-serif text-[12.5px] leading-5 text-[var(--text-secondary)]">
              &ldquo;{n.excerpt}&rdquo;
            </p>
            <p className="mt-1 pl-[34px] font-mono text-[10.5px] uppercase tracking-wider text-[var(--text-secondary)]">
              {relativeTime(n.time)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
