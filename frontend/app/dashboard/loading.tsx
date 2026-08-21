/**
 * Shown while a route under /dashboard is being fetched.
 *
 * Every one of these routes is dynamic (`ƒ` in the build output), and
 * Next.js won't prefetch a dynamic route that has no loading boundary — so
 * without this file a click sat on the *old* page for the whole server
 * round trip with no feedback at all.
 *
 * Kept to four shapes on purpose. This one boundary covers the You page,
 * Posts, Saved and the canvas workspaces, so a detailed skeleton would be
 * wrong on most of them; all it needs to say is "a page is arriving, it
 * has a heading and a body". The `.skeleton` styling (globals.css) stays
 * silent for the first 150ms, so a fast navigation never flashes this at
 * all.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5" aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>

      <div className="flex flex-col gap-3">
        <div className="skeleton h-3 w-14 rounded-full" />
        <div className="skeleton h-9 w-64 sm:w-80" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 pb-1 xl:grid-cols-[1fr_320px]">
        <div className="skeleton min-h-[18rem] flex-1" />
        <div className="skeleton hidden min-h-[18rem] xl:block" />
      </div>
    </div>
  );
}
