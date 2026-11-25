import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built assets live under /_next/static/immutable/, named by a shortened content hash in a
  // namespace shared across deployments. A salt of our own keeps those names from colliding with
  // another build's files (v0.6.1 served someone else's stylesheet). Change it to rotate them all.
  outputHashSalt: "lockerly",
  // No other site may frame the app (clickjacking), and browsers don't guess types or send paths on.
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]),
  cacheComponents: true,
  partialPrefetching: true,
  // The demo reset reads its files at run time, which the build can't see.
  outputFileTracingIncludes: {
    "/api/cron/reset-demo": ["./fixtures/demo/**", "./fixtures/files/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
