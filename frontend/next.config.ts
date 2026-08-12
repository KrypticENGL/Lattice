import type { NextConfig } from "next";

/** Base URL of the Rust backend during development. */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

/** Base URL of the ytmusicapi FastAPI service during development. */
const YTMUSIC_URL = process.env.YTMUSIC_URL ?? "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  /**
   * Proxy `/api/*` calls from the browser to the Rust + Tokio backend, so
   * frontend code can fetch relative URLs like `/api/health`. The more
   * specific `/api/ytmusic/*` rule must come first — these are matched
   * in order and both would otherwise be swallowed by the catch-all.
   */
  async rewrites() {
    return [
      {
        source: "/api/ytmusic/:path*",
        destination: `${YTMUSIC_URL}/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
