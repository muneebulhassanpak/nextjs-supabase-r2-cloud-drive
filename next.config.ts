import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built assets live under /_next/static/immutable/, named by a shortened content hash in a
  // namespace shared across deployments. A salt of our own keeps those names from colliding with
  // another build's files (v0.6.1 served someone else's stylesheet). Change it to rotate them all.
  outputHashSalt: "lockerly",
  cacheComponents: true,
  partialPrefetching: true,
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
