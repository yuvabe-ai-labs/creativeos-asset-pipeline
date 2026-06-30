// Smoke-test GCS connectivity end-to-end.
// Reads env from .env (via Next's process.env loading is not active here, so
// we read .env directly with a tiny parser to keep this script standalone).
//
// Run with: node scripts/test-gcs.mjs
//
// Expected output: "✅ Smoke test passed." (status 200 → upload, 404 → after delete)

import { Storage } from "@google-cloud/storage";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file) {
  try {
    const content = readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // env file optional
  }
}

loadEnv(resolve(process.cwd(), ".env"));
loadEnv(resolve(process.cwd(), ".env.local"));

const projectId = process.env.GCP_PROJECT_ID;
const bucketName = process.env.GCS_BUCKET;
const keyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64;

if (!projectId || !bucketName) {
  console.error("Missing GCP_PROJECT_ID or GCS_BUCKET in .env.");
  process.exit(1);
}
if (!keyBase64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "Missing GCP_SERVICE_ACCOUNT_KEY_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.",
  );
  process.exit(1);
}

const credentials = keyBase64
  ? JSON.parse(Buffer.from(keyBase64, "base64").toString("utf8"))
  : undefined;
const storage = new Storage(
  credentials ? { projectId, credentials } : { projectId },
);
const bucket = storage.bucket(bucketName);

const path = `tmp/smoke-test-${Date.now()}.txt`;
const body = Buffer.from("hello from gcs smoke test");
const url = `https://storage.googleapis.com/${bucketName}/${path}`;

async function main() {
  console.log(`→ Uploading to gs://${bucketName}/${path}…`);
  await bucket.file(path).save(body, { contentType: "text/plain" });
  console.log(`  Public URL: ${url}`);

  console.log("→ Fetching URL…");
  const r1 = await fetch(url);
  console.log(`  Status: ${r1.status} (expect 200)`);
  console.log(`  Body: ${await r1.text()}`);

  console.log("→ Deleting…");
  await bucket.file(path).delete({ ignoreNotFound: true });

  console.log("→ Re-fetching URL (cache-busted)…");
  const r2 = await fetch(`${url}?cb=${Date.now()}`, { cache: "no-store" });
  console.log(`  Status: ${r2.status} (expect 404)`);

  if (r1.status === 200 && r2.status === 404) {
    console.log("\n✅ Smoke test passed.");
  } else {
    console.log("\n❌ Smoke test failed.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
