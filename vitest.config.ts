import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Mirrors the tsconfig path alias (@/* -> ./src/*) so tests can import via "@/...".
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": path.resolve(__dirname, "./__mocks__/server-only.ts"),
    },
  },
});
