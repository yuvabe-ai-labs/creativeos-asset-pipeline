import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, a stray lockfile in a
  // parent directory makes Next.js infer the wrong root (see build warning).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
