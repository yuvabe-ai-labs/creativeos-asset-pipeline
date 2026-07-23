// Validates that a target env file defines every key listed in .env.example.
// Usage: node scripts/check-env.mjs <path-to-env-file>
import { readFileSync, existsSync } from "node:fs";

function parseKeys(path) {
  if (!existsSync(path)) {
    console.error(`Missing file: ${path}`);
    process.exit(1);
  }
  const keys = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/check-env.mjs <path-to-env-file>");
  process.exit(1);
}

const exampleKeys = parseKeys(".env.example");
const targetKeys = parseKeys(target);

const missing = [...exampleKeys].filter((k) => !targetKeys.has(k));
const extra = [...targetKeys].filter((k) => !exampleKeys.has(k));

if (missing.length) {
  console.error(`\n✗ ${target} is missing ${missing.length} key(s) from .env.example:`);
  for (const k of missing) console.error(`  - ${k}`);
}
if (extra.length) {
  console.warn(`\n⚠ ${target} has ${extra.length} key(s) not in .env.example (consider adding them there):`);
  for (const k of extra) console.warn(`  - ${k}`);
}

if (missing.length) {
  console.error("\nFix the missing keys above before switching to this env.\n");
  process.exit(1);
}

console.log(`\n✓ ${target} has all required keys.\n`);
