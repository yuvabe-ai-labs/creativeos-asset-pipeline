// Provider-contract spike for the market media archive (D257-D264).
//
// Answers the one question the design rests on and unit tests cannot:
//   Does apify/instagram-scraper return a DIRECT, FETCHABLE MEDIA URL when given a
//   SINGLE reel/post permalink via directUrls — or only in profile-crawl mode?
//
// This matters because the existing integration (src/lib/market/apify.ts, D235) only
// ever calls resultsType:"details" on a PROFILE url. The archive task needs per-post
// input, which is a different call shape against the same actor. The actor's docs list
// `videoUrl` on reels; this checks it against the live endpoint, because a fixture
// freezes an assumption and stays green after the provider moves.
//
// It also probes whether the returned URL is actually downloadable by us (a HEAD-like
// ranged GET), since an Instagram CDN link can be present but signature-gated.
//
// Usage: node scripts/spike-instagram-permalink.mjs [reelUrl]
// Reads APIFY_TOKEN from the environment, or from .env.local / .env if present.
// Costs one Apify result-charge (~$0.0027 on the free plan). Writes nothing to the DB.

import { readFileSync, existsSync, writeFileSync } from "node:fs";

const ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";

function loadToken() {
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.trim().match(/^APIFY_TOKEN\s*=\s*(.+)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

// A well-known, long-lived public reel. Override on the command line to test another.
const url = process.argv[2] ?? "https://www.instagram.com/reel/C8Qh7ORyGZG/";
const token = loadToken();

if (!token) {
  console.error(
    "\nMissing APIFY_TOKEN.\n" +
      "  Set it in .env.local, or pass it inline:\n" +
      "  APIFY_TOKEN=apify_api_... node scripts/spike-instagram-permalink.mjs\n",
  );
  process.exit(1);
}

const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label) => console.log(`  ✗ ${label}`);

function check(label, value) {
  const missing = value === undefined || value === null || value === "";
  const shown = missing ? "MISSING" : String(value).slice(0, 96);
  (missing ? bad : ok)(`${label.padEnd(18)} ${shown}`);
  return !missing;
}

console.log(`\nScraping a SINGLE permalink via apify/instagram-scraper`);
console.log(`  url: ${url}`);

const startedAt = Date.now();
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    directUrls: [url],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  }),
});

if (!res.ok) {
  console.error(`\nApify request failed: HTTP ${res.status}`);
  console.error(await res.text().catch(() => "(no body)"));
  process.exit(1);
}

const items = await res.json();
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nReturned ${items.length} dataset item(s) in ${elapsed}s.`);

if (!items.length) {
  console.error("\nNo items. The permalink may be gated, deleted, or the input shape is wrong.");
  process.exit(1);
}

const post = items[0];

console.log("\n-- BILLING ------------------------------------------------------");
console.log(`  dataset items billed: ${items.length} (one permalink should be 1)`);

console.log("\n-- FIELDS THE ARCHIVE RESOLVER NEEDS ----------------------------");
const hasType = check("type", post.type);
const hasVideo = check("videoUrl", post.videoUrl);
const hasDisplay = check("displayUrl", post.displayUrl);
check("videoDuration", post.videoDuration);
check("shortCode", post.shortCode);
check("productType", post.productType);
check("images[] length", Array.isArray(post.images) ? post.images.length : undefined);

console.log("\n-- ALL TOP-LEVEL KEYS -------------------------------------------");
console.log("  " + Object.keys(post).sort().join(", "));

// The URL being present is not the same as it being downloadable by us.
const mediaUrl = post.videoUrl ?? post.displayUrl;
if (mediaUrl) {
  console.log("\n-- IS IT ACTUALLY FETCHABLE FROM OUR SIDE? ----------------------");
  try {
    const probe = await fetch(mediaUrl, { headers: { Range: "bytes=0-2047" } });
    console.log(`  HTTP ${probe.status} ${probe.statusText}`);
    console.log(`  content-type:   ${probe.headers.get("content-type") ?? "(none)"}`);
    console.log(`  content-length: ${probe.headers.get("content-length") ?? "(none)"}`);
    const buf = await probe.arrayBuffer();
    console.log(`  bytes received: ${buf.byteLength}`);
    if (probe.ok && buf.byteLength > 0) ok("downloadable — the archive task can re-host this");
    else bad("NOT downloadable — resolver would need a different route");
  } catch (e) {
    bad(`fetch threw: ${e.message}`);
  }
}

const outFile = "reports/spike-instagram-permalink.json";
try {
  writeFileSync(outFile, JSON.stringify(post, null, 2));
  console.log(`\nFull payload written to ${outFile}`);
} catch {
  console.log("\n(could not write reports/ — payload not saved)");
}

console.log("\n-- VERDICT ------------------------------------------------------");
if (hasVideo) {
  console.log("  Reels DO expose videoUrl on a single-permalink call. Resolver is viable.");
} else if (hasDisplay && hasType && post.type !== "Video") {
  console.log("  This permalink is a still; displayUrl present. Re-run with a REEL url to");
  console.log("  settle the video question.");
} else {
  console.log("  NO videoUrl. The instagram rung needs a different actor or call shape.");
}
console.log();
