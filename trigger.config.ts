import { defineConfig } from "@trigger.dev/sdk/v3";

// The Trigger.dev CLI's own config loader doesn't read .env before evaluating this
// file, so load it ourselves (Node 20.6+ built-in — no dependency needed) rather than
// requiring a manual shell export every time. Wrapped in try/catch: harmless if .env
// doesn't exist in whatever context this file gets evaluated in (e.g. already-loaded
// env in a deploy pipeline).
try {
  process.loadEnvFile();
} catch {
  // no .env file present — fall through and rely on already-set env vars
}

// Staging and production are separate Trigger.dev projects (free-tier accounts don't
// support multiple environments within one project) — read the ref from whichever
// .env is currently active (npm run env:staging / env:prod), not hardcoded.
const projectId = process.env.TRIGGER_PROJECT_ID;
if (!projectId) {
  throw new Error(
    "Missing TRIGGER_PROJECT_ID — run npm run env:staging or npm run env:prod first.",
  );
}

export default defineConfig({
  project: projectId,
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
