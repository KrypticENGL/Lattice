import { NOTIFICATIONS } from "@/lib/dashboard-data";

export default function Notifications() {
  return (
    // `h-full min-h-0` so it can absorb whatever the sidebar has left over
    // once the Resource Monitor has taken its (fixed) share, and shrink
    // instead of overflowing when that is not much.
    <div className="matte flex h-full min-h-0 flex-col rounded-2xl p-4">
      <div className="flex shrink-0 items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Notifications
        </h2>
        <span className="font-mono text-[13px] uppercase tracking-wider text-[var(--accent-secondary)]">
          {NOTIFICATIONS.length} new
        </span>
      </div>

      {/* The list scrolls within whatever height it is given, rather than
        * standing at a fixed 440px the page then has to find room for. */}
      <ul className="scrollbar-thin mt-3 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1">
        {NOTIFICATIONS.map((n) => (
          <li
            key={n.id}
            className="border-t border-[var(--hairline)] py-4 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold"
                style={{ background: "var(--bg-elevated)", color: "var(--accent-secondary)" }}
              >
                {n.author.charAt(0)}
              </span>
              <p className="text-[13px] leading-5 text-[var(--text-primary)]">
                <span className="font-semibold">{n.author}</span>{" "}
                <span className="text-[var(--text-secondary)]">
                  {n.type === "reply" ? "replied to" : "commented on"}
                </span>{" "}
                <span className="font-semibold">{n.postTitle}</span>
              </p>
            </div>
            <p className="mt-2 pl-[38px] font-serif text-[13px] leading-5 text-[var(--text-secondary)]">
              &ldquo;{n.excerpt}&rdquo;
            </p>
            <p className="mt-1.5 pl-[38px] font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)]">
              {n.time}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
