// Copies an environment-specific env file over .env.
// Usage: node scripts/use-env.mjs <staging|production>
import { copyFileSync, existsSync } from "node:fs";

const env = process.argv[2];
if (!env || !["staging", "production"].includes(env)) {
  console.error("Usage: node scripts/use-env.mjs <staging|production>");
  process.exit(1);
}

const source = `.env.${env}`;
if (!existsSync(source)) {
  console.error(`Missing file: ${source}`);
  process.exit(1);
}

copyFileSync(source, ".env");
console.log(`\n✓ .env now points at ${env} (copied from ${source}).\n`);
