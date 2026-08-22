"use client";

import { useUser } from "@clerk/nextjs";

/**
 * The You page's "Welcome back, <name>." headline.
 *
 * Client-side on purpose. Reading the name on the server means
 * `currentUser()`, which is a live HTTPS round trip to Clerk's Backend API
 * on *every* render of this page — ~400ms of server time, in production as
 * well as dev, for one string. `auth()` (the actual authentication check,
 * in the dashboard layout) is networkless: it verifies the session JWT
 * locally, which is why every other dashboard route renders in ~10ms.
 *
 * `useUser()` reads the user the Clerk browser SDK has already loaded for
 * the sidebar's `UserButton`, so this costs no extra request at all, and
 * the page's server render no longer waits on anyone.
 */
export default function Greeting() {
  const { user, isLoaded } = useUser();

  return (
    <h1 className="text-balance mt-1.5 font-serif text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-4xl">
      Welcome back
      <span
        className="transition-opacity duration-200"
        style={{ opacity: isLoaded ? 1 : 0 }}
      >
        , {user?.firstName ?? "there"}
      </span>
      .
    </h1>
  );
}
