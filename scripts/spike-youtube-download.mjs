// Provider-contract spike for the YouTube rung of the market media archive (D264-D268).
//
// The design spec cannot specify this resolver, because the actor's page documents its
// INPUT but not its OUTPUT. Three unknowns, all of which block coding:
//   1. Does streamers/youtube-video-downloader accept a SHORTS url at all? (Its page
//      never says so, and Apify ships a separate Shorts tool — mild evidence against.)
//   2. What are the dataset item's field names? "downloadUrl"? "url"? something else?
//   3. With storeInKVStore:false and no cloud credentials, does a FETCHABLE link come
//      back — or does the actor only ever write to storage we'd have to give it?
//
// Fallback under test: maximedupre/youtube-shorts-downloader, which is purpose-built for
// Shorts and documents source-hosted links (which is fine — we download immediately).
// Pass --fallback to probe that one instead.
//
// Usage: node scripts/spike-youtube-download.mjs [shortUrl] [--fallback]
// Reads APIFY_TOKEN from the environment, or from .env.local / .env if present.
// Costs one Apify event-charge. Writes nothing to the database.

import { readFileSync, existsSync, writeFileSync } from "node:fs";

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

const args = process.argv.slice(2);
const useFallback = args.includes("--fallback");
const url = args.find((a) => a.startsWith("http")) ?? "https://www.youtube.com/shorts/tPEE9ZwTmy0";
const token = loadToken();

if (!token) {
  console.error(
    "\nMissing APIFY_TOKEN.\n" +
      "  APIFY_TOKEN=apify_api_... node scripts/spike-youtube-download.mjs\n",
  );
  process.exit(1);
}

const actor = useFallback ? "maximedupre~youtube-shorts-downloader" : "streamers~youtube-video-downloader";
const input = useFallback
  ? { startUrls: [{ url }] }
  : {
      videos: [{ url }],
      preferredFormat: "mp4",
      preferredQuality: "720p",
      // Deliberately false: we want to know whether a link comes back WITHOUT handing
      // the actor storage. If it only works with storeInKVStore, that is a finding —
      // Apify's KV store deletes after ~3 days, so it cannot be our archive.
      storeInKVStore: false,
    };

const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=280`;

const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label) => console.log(`  ✗ ${label}`);

console.log(`\nProbing ${actor}`);
console.log(`  url:   ${url}`);
console.log(`  input: ${JSON.stringify(input)}`);

const startedAt = Date.now();
const res = await fetch(endpoint, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(input),
});

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

if (!res.ok) {
  console.error(`\nApify request failed after ${elapsed}s: HTTP ${res.status}`);
  console.error(await res.text().catch(() => "(no body)"));
  console.error(
    "\nIf this is a 404, the actor id is wrong. If 400, the input shape is wrong —\n" +
      "check the actor's input schema on its Apify page and adjust `input` above.",
  );
  process.exit(1);
}

const items = await res.json();
console.log(`\nReturned ${items.length} dataset item(s) in ${elapsed}s.`);

if (!items.length) {
  console.error("\nNo items — the actor ran but saved nothing.");
  console.error("For a Shorts url this usually means Shorts are NOT supported. Try --fallback.");
  process.exit(1);
}

const item = items[0];

console.log("\n-- ALL TOP-LEVEL KEYS (the undocumented part) -------------------");
for (const [k, v] of Object.entries(item)) {
  const shown =
    typeof v === "string" ? v.slice(0, 88) : Array.isArray(v) ? `[${v.length} items]` : String(v);
  console.log(`  ${k.padEnd(24)} ${shown}`);
}

// Hunt for anything that looks like a media link, whatever it ended up being called.
const candidates = Object.entries(item).filter(
  ([k, v]) =>
    typeof v === "string" &&
    /^https?:\/\//.test(v) &&
    /(download|media|video|file|url|link|mp4)/i.test(k),
);

console.log("\n-- MEDIA LINK CANDIDATES ----------------------------------------");
if (!candidates.length) {
  bad("no field looks like a downloadable media link");
} else {
  for (const [k] of candidates) ok(`${k}`);
}

let fetchable = false;
for (const [key, candidate] of candidates) {
  // The page url is not a media file; skip the obvious self-reference.
  if (candidate.includes("youtube.com/watch") || candidate.includes("youtube.com/shorts")) continue;
  console.log(`\n-- PROBING ${key} ------------------------------------------------`);
  try {
    // No Range header: the Instagram CDN rejects ranged requests outright (verified in
    // the sibling spike, 2026-09-11), so the archive downloader will never send one and
    // this probe mirrors that. The body is cancelled after the headers so a large mp4
    // is not pulled down just to identify it.
    const probe = await fetch(candidate);
    const type = probe.headers.get("content-type") ?? "(none)";
    const len = probe.headers.get("content-length") ?? "(none)";
    console.log(`  HTTP ${probe.status}  content-type: ${type}`);
    console.log(`  content-length: ${len}`);
    await probe.body?.cancel();
    if (probe.ok && /video|octet-stream/i.test(type)) {
      ok(`${key} is a real, fetchable media file — this is the resolver's field`);
      fetchable = true;
    } else {
      bad(`${key} did not return video bytes`);
    }
  } catch (e) {
    bad(`${key} fetch threw: ${e.message}${e.cause ? " / " + e.cause.message : ""}`);
  }
}

const outFile = `reports/spike-youtube-${useFallback ? "fallback" : "streamers"}.json`;
try {
  writeFileSync(outFile, JSON.stringify(items, null, 2));
  console.log(`\nFull payload written to ${outFile}`);
} catch {
  console.log("\n(could not write reports/ — payload not saved)");
}

console.log("\n-- VERDICT ------------------------------------------------------");
if (fetchable) {
  console.log(`  ${actor} WORKS for Shorts. Record the field name above in the design spec.`);
} else {
  console.log(`  ${actor} did NOT yield a fetchable mp4.`);
  console.log(
    useFallback
      ? "  Both actors failed. The youtube rung needs rethinking before it is planned."
      : "  Re-run with --fallback to test maximedupre/youtube-shorts-downloader.",
  );
}
console.log();
