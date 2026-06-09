import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, ".env") });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["./reporters/linear-reporter.ts"],
    ["./reporters/excel-reporter.ts"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: process.env.TRACE ? "on" : "on-first-retry",
    video: "on",
    screenshot: "only-on-failure",
    actionTimeout: process.env.CI ? 20_000 : 15_000,
    navigationTimeout: process.env.CI ? 45_000 : 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          slowMo: process.env.SLOW_MO ? Number(process.env.SLOW_MO) : 0,
        },
      },
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
