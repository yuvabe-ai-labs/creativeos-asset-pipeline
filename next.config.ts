import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, a stray lockfile in a
  // parent directory makes Next.js infer the wrong root (see build warning).
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    // The login panel's photography (src/lib/login-images.ts). Scoped to this one
    // host so an arbitrary remote URL can't be laundered through our optimiser.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
