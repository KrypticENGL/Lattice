import type { NextConfig } from "next";

/** Base URL of the Rust backend during development. */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * TTL (seconds) on the client-side Router Cache — the rendered RSC
     * payload for a route the user has already visited.
     *
     * `dynamic` covers every route under /dashboard (they all read auth,
     * so none of them are static). Next.js 15 changed this default to 0,
     * meaning *every* navigation re-fetched from the server even when you
     * were just bouncing between two pages. 30s is the pre-15 default: a
     * round trip the first time, instant after that, and short enough that
     * data can't sit visibly stale.
     *
     * `static` covers prefetched loading boundaries (see
     * app/dashboard/loading.tsx) and the public landing page.
     *
     * Caveat: after a mutation that changes what another route shows —
     * renaming a canvas, publishing a post — call `router.refresh()` so
     * the cached payload for that route is dropped rather than served for
     * up to 30 more seconds.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  /**
   * Proxy `/api/*` calls from the browser to the Rust + Tokio backend, so
   * frontend code can fetch relative URLs like `/api/health`.
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
