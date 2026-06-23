import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "",
  dirs: ["./trigger"],
  maxDuration: 1200,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
});
