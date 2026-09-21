import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Integration checks that hit REAL services (Apify, GCS, Supabase) using whatever
// project .env points at. Deliberately a separate config with a separate file
// extension (.itest.ts) so `npx vitest run` never picks these up: they cost money,
// mutate real rows, and need credentials CI does not have.
//
//   npx vitest run --config vitest.integration.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.itest.ts"],
    // A cold Apify actor took 38s in the spikes; a reel download adds more.
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": path.resolve(__dirname, "./__mocks__/server-only.ts"),
    },
  },
});
