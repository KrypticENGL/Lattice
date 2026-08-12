import type { NextConfig } from "next";

/** Base URL of the Rust backend during development. */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
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
