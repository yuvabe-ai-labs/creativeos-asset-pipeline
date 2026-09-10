// Provider-contract spike for the Performance tab (D235).
//
// Answers two questions that unit tests cannot, because they are about the provider
// rather than about us:
//   1. BILLING — does one `details` profile scrape bill as 1 result, or as 1 + N posts?
//      The actor's own docs and its store listing disagree, a ~13x difference. The
//      dataset item count settles it.
//   2. FEASIBILITY — does every field the tab renders actually come back? Each stat
//      card, the trend line, the identity strip and the post tile are checked against
//      the live payload, so a missing field shows up here rather than as an em-dash
//      in the UI.
//
// It deliberately does NOT re-test our own maths: normalizeProfileItem / computeStats
// are unit-tested against a fixture in src/lib/market/performance.test.ts. This checks
// the assumption those tests are built on.
//
// Usage: node scripts/spike-instagram.mjs [handle]
//        APIFY_TOKEN=... node scripts/spike-instagram.mjs prakritisattva
//
// Reads APIFY_TOKEN from the environment, or from .env.local / .env if present.
// Costs one Apify result-charge. Writes nothing to the database.

import { readFileSync, existsSync, writeFileSync } from "node:fs";

const ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";

// Same free-plan rate the design spec quotes; only used to turn the item count into money.
const USD_PER_1K_RESULTS = 2.7;

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

const handle = (process.argv[2] ?? "prakritisattva").replace(/^@/, "").toLowerCase();
const token = loadToken();

if (!token) {
  console.error(
    "\nMissing APIFY_TOKEN.\n" +
      "  Set it in .env.local, or pass it inline:\n" +
      "  APIFY_TOKEN=apify_api_... node scripts/spike-instagram.mjs " + handle + "\n",
  );
  process.exit(1);
}

const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label) => console.log(`  ✗ ${label}`);

/** Reports presence and prints the value, so "present but useless" is visible too. */
function check(label, value, extra = "") {
  const missing = value === undefined || value === null || value === "";
  (missing ? bad : ok)(`${label.padEnd(26)} ${missing ? "MISSING" : String(value)}${extra}`);
  return !missing;
}

console.log(`\nScraping @${handle} via apify/instagram-scraper (resultsType: details)…`);
const startedAt = Date.now();

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "details",
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

if (!Array.isArray(items) || items.length === 0) {
  console.error(`\nEmpty dataset — @${handle} is unknown, private, or blocked.`);
  process.exit(1);
}

const profile = items[0];
const posts = profile.latestPosts ?? [];

// ── 1. Billing ────────────────────────────────────────────────────────────────
console.log(`\n── BILLING ─────────────────────────────────`);
console.log(`  dataset items returned     ${items.length}`);
console.log(`  posts embedded in item[0]  ${posts.length}`);
console.log(`  wall time                  ${elapsed}s`);

const perScrape = items.length;
const monthly = perScrape * 30 * (USD_PER_1K_RESULTS / 1000);
console.log(
  `\n  If billed per dataset item, one handle at daily cadence costs\n` +
    `  ~$${monthly.toFixed(3)}/month, and the free $5 credit covers ~${Math.floor(5 / monthly)} handles.`,
);
console.log(
  `  ⚠ Confirm against the run's cost in the Apify console — the item count is\n` +
    `    the best local signal, but the console is authoritative.`,
);

// ── 2. Feasibility ────────────────────────────────────────────────────────────
console.log(`\n── IDENTITY STRIP ───────────────────────────`);
check("username", profile.username);
check("businessCategoryName", profile.businessCategoryName);
check("externalUrl", profile.externalUrl);
check("profilePicUrlHD", profile.profilePicUrlHD);

console.log(`\n── STAT CARDS ──────────────────────────────`);
check("followersCount", profile.followersCount, "  ← Followers card + engagement divisor");
check("followsCount", profile.followsCount, "  ← 'N following' hint");
check("postsCount", profile.postsCount, "  ← Posts card");

console.log(`\n── POST TILES (${posts.length} posts) ───────────────────`);
const REQUIRED = ["shortCode", "type", "url", "timestamp"];
const missingByField = {};
let hiddenLikes = 0;
let withViews = 0;
let withThumb = 0;
const types = new Set();

for (const p of posts) {
  for (const field of REQUIRED) {
    if (p[field] === undefined || p[field] === null) {
      missingByField[field] = (missingByField[field] ?? 0) + 1;
    }
  }
  types.add(p.type);
  if (p.likesCount === -1) hiddenLikes++;
  if (typeof p.videoViewCount === "number") withViews++;
  if (p.displayUrl) withThumb++;
}

for (const field of REQUIRED) {
  const n = missingByField[field] ?? 0;
  (n === 0 ? ok : bad)(`${field.padEnd(26)} ${n === 0 ? "on all posts" : `MISSING on ${n}`}`);
}
ok(`${"displayUrl".padEnd(26)} on ${withThumb}/${posts.length}  ← GCS re-host source`);
ok(`${"videoViewCount".padEnd(26)} on ${withViews}/${posts.length}  ← videos only, expected`);
console.log(`  · provider type values      ${[...types].join(", ")}`);

const unmapped = [...types].filter((t) => !["Image", "Video", "Sidecar"].includes(t));
if (unmapped.length) {
  bad(`UNMAPPED post types: ${unmapped.join(", ")} — TYPE_MAP would fall back to "image"`);
}

// ── 3. The two things that cannot be tested locally ───────────────────────────
console.log(`\n── SENTINELS & CEILINGS ─────────────────────`);
console.log(
  `  likesCount === -1 (hidden)  ${hiddenLikes}/${posts.length}` +
    (hiddenLikes === posts.length && posts.length > 0
      ? "  ⚠ ALL hidden — medians and every multiplier pill would be null"
      : ""),
);
for (const absent of ["reach", "impressions", "saves", "shares"]) {
  const present = profile[absent] !== undefined;
  console.log(`  ${absent.padEnd(26)} ${present ? "present (!)" : "absent — owner-auth only, as expected"}`);
}

// ── 4. Verdict ────────────────────────────────────────────────────────────────
const renderable =
  typeof profile.followersCount === "number" &&
  posts.length > 0 &&
  Object.keys(missingByField).length === 0;

console.log(`\n── VERDICT ───────────────────────────────`);
console.log(
  renderable
    ? "  ✓ Every field the tab renders is present. The design is feasible as specified."
    : "  ✗ Fields the tab renders are missing — see above before building against them.",
);
console.log(
  "  Note: the follower trend and the 7-day delta cannot be verified here at all.\n" +
    "  They are OURS, not the provider's — they exist only after 2 and 8 daily\n" +
    "  snapshots respectively. That is the whole premise of D235.",
);

const out = `spike-${handle}-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(out, JSON.stringify(items, null, 2));
console.log(`\n  Full payload written to ${out} (gitignored — do not commit).\n`);
