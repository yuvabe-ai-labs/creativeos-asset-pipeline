import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "your-project-ref",
  dirs: ["./trigger"],
  maxDuration: 600,
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
