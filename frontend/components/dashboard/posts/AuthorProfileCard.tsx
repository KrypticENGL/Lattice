import type { ReactNode } from "react";
import { Avatar } from "./PostChrome";
import { badgesOf, type AuthorProfile, type BadgeIconName } from "@/lib/posts/authors";
import type { Post } from "@/lib/posts/types";

/**
 * Who wrote this, beside what they wrote.
 *
 * A post's page is the one place the person is as interesting as the
 * piece: a trace someone posts means something different coming from an
 * account with a month-long streak and two thousand runs behind it than
 * it does from an empty one. So the panel carries the handle, the badges
 * they have earned, the longest run of days they kept up, and the total
 * number of traces they have run.
 *
 * The byline is drawn from the post and the record from the profile, on
 * purpose. Every post has an author; not every author has a profile
 * behind them (see `getAuthorProfile`), and a page whose whole sidebar
 * vanished for those would be worse than one that just shows less.
 */

const GLYPHS: Record<BadgeIconName, ReactNode> = {
  flame: <path d="M8 1.5s3.5 3.2 3.5 6.2A3.5 3.5 0 0 1 8 14.5 3.5 3.5 0 0 1 4.5 7.7C4.5 4.7 8 1.5 8 1.5z" />,
  cycle: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 3l2.3 1.6L8 6.2" />
    </>
  ),
  tree: (
    <>
      <path d="M8 3.7v1.8M8 5.5L4.6 8.8M8 5.5l3.4 3.3" />
      <circle cx="8" cy="2.6" r="1.2" />
      <circle cx="4.5" cy="10" r="1.2" />
      <circle cx="11.5" cy="10" r="1.2" />
    </>
  ),
  path: (
    <>
      <path d="M2.8 11.8L6 7.2l3.4 2.9 3.6-6" />
      <circle cx="2.6" cy="12.2" r="1.1" />
      <circle cx="13.3" cy="3.8" r="1.1" />
    </>
  ),
  blocks: (
    <>
      <rect x="2.4" y="2.8" width="5.6" height="4" rx="1" />
      <rect x="8" y="9.2" width="5.6" height="4" rx="1" />
      <path d="M5.2 6.8v3.4a1 1 0 0 0 1 1H8" />
    </>
  ),
  bug: (
    <>
      <ellipse cx="8" cy="9.2" rx="3" ry="3.7" />
      <path d="M8 5.5V3.8M5.2 6.6L3.4 5.2M10.8 6.6l1.8-1.4M5 9.4H2.8M11 9.4h2.2M5.4 11.9L3.7 13.2M10.6 11.9l1.7 1.3" />
    </>
  ),
  pen: <path d="M11 2l3 3-8 8H3v-3l8-8z" />,
  mentor: (
    <>
      <path d="M13.5 3.5H2.5a.5.5 0 0 0-.5.5v6.5a.5.5 0 0 0 .5.5H5v2.5l3-2.5h5.5a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5z" />
      <path d="M5.7 7.2l1.6 1.6 3-3" />
    </>
  ),
};

function BadgeIcon({ name }: { name: BadgeIconName }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      {GLYPHS[name]}
    </svg>
  );
}

/** One number, said once. Not `StatCard`: these sit *inside* a panel
 * that is already `matte`, and stacking that material on itself turns a
 * quiet sidebar into two nested cards fighting for the same edge. */
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-elevated)] px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-1 font-serif text-[22px] font-black leading-none tracking-tight text-[var(--text-primary)]">
        <span className="tabular-nums">{value}</span>
        {unit && (
          <span className="ml-1 font-mono text-[11px] font-medium text-[var(--text-secondary)]">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export default function AuthorProfileCard({
  post,
  profile,
  className = "",
}: {
  post: Post;
  profile: AuthorProfile | null;
  className?: string;
}) {
  const badges = profile ? badgesOf(profile) : [];

  return (
    <aside className={`matte rounded-2xl p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <Avatar name={post.author} className="h-11 w-11 text-[13px]" />
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">
            {post.handle}
          </p>
          <p className="font-mono text-[11px] text-[var(--text-secondary)]">{post.author}</p>
        </div>
      </div>

      {profile && (
        <>
          <p className="mt-3 font-serif text-[13px] leading-6 text-[var(--text-secondary)]">
            {profile.bio}
          </p>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {profile.joined}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Longest streak" value={String(profile.longestStreak)} unit="days" />
            {/* Explicit locale, so the thousands separator is the same
              * string on the server and in the browser — `toLocaleString`
              * with no argument follows whatever the runtime's default is
              * and is a hydration mismatch waiting for its first visitor
              * outside en-US. */}
            <Stat label="Traces run" value={profile.traceRuns.toLocaleString("en-US")} />
          </div>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Badges
              <span className="ml-1.5 text-[var(--text-primary)]">{badges.length}</span>
            </p>

            {badges.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {badges.map((badge) => (
                  <li
                    key={badge.id}
                    className="flex items-start gap-2.5 rounded-xl border px-2.5 py-2"
                    style={{
                      borderColor: `color-mix(in srgb, ${badge.accent} 35%, transparent)`,
                      background: `color-mix(in srgb, ${badge.accent} 7%, transparent)`,
                    }}
                  >
                    <span style={{ color: badge.accent }}>
                      <BadgeIcon name={badge.icon} />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="font-mono text-[11px] font-semibold"
                        style={{ color: badge.accent }}
                      >
                        {badge.label}
                      </p>
                      {/* The description is on the tile rather than in a
                        * tooltip: a badge you have to hover to understand
                        * is decoration, not a credential. */}
                      <p className="font-serif text-[12px] leading-snug text-[var(--text-secondary)]">
                        {badge.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 font-serif text-[12px] text-[var(--text-secondary)]">
                No badges yet.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
