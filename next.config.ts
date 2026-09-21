import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, a stray lockfile in a
  // parent directory makes Next.js infer the wrong root (see build warning).
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Review annotations post their painted overlays inside the approval action's body
    // (D211), and Next's 1 MB default is too tight for a handful of them. 4 MB is the
    // ceiling worth asking for, NOT an arbitrary bump: Vercel hard-caps a function
    // request body at 4.5 MB, so anything larger would pass here and 413 in production
    // (see docs/superpowers/specs/2026-07-20-vercel-upload-payload-limit.md).
    // MAX_TOTAL_BYTES in src/lib/review-annotations/constants.ts stays under this.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    // The login panel's photography (src/lib/login-images.ts). Scoped to this one
    // host so an arbitrary remote URL can't be laundered through our optimiser.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
