import { defineConfig } from "@trigger.dev/sdk/v3";

// The Trigger.dev CLI's own config loader doesn't read .env before evaluating this
// file, so load it ourselves (Node 20.6+ built-in — no dependency needed) rather than
// requiring a manual shell export every time. Each load is wrapped in try/catch:
// harmless if the file doesn't exist in whatever context this file gets evaluated in
// (e.g. already-loaded env in a deploy pipeline).
//
// Order matters: process.loadEnvFile() never overwrites a var that is already set, so
// the FIRST file to define a key wins. .env goes first because it's the deliberate
// staging/production switch written by `npm run env:staging` / `env:prod`; .env.local
// (the everyday local file Next.js reads) only fills in what's still missing.
for (const envFile of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // file not present — fall through to the next one / already-set env vars
  }
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
  build: {
    // sharp is a native module (a platform-specific .node binary), which esbuild cannot bundle.
    // Marked external, Trigger installs it into the deploy image instead — at the version found in
    // node_modules — so the Linux build gets the Linux binary rather than this machine's. Needed
    // since the Seedance provider re-encodes out-of-range images before sending them
    // (src/lib/video-gen/providers/seedance-images.ts).
    external: ["sharp"],
  },
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
