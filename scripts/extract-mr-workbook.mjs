// Extracts seedable market references from the MR research workbook.
//
// Usage: node scripts/extract-mr-workbook.mjs "<path to .xlsx>" [outDir]
//
// The workbook has two sheets: a brand -> official-handle table, and ~550 scraped
// Instagram posts. Two things make the raw sheet unusable as-is:
//
//   1. Only ~9% of posts come from the brand's own account. The rest are resellers,
//      distributors and UGC. "Authentic" means the post's Profile Handle IS the
//      brand's official handle — matched exactly, never by prefix, because handles
//      like `vilvahsjswethasstore` are reseller shops, not the brand.
//   2. There is NO views column, for videos or anything else. "Top performing" is
//      therefore likes + comments; nothing here can rank by reach.
//
// Near-miss handles (`vilvah_` where sheet 1 says `@vilvah`) are emitted separately
// for human review rather than silently promoted — that call belongs to MR.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

// ── xlsx (a zip of XML) → rows ────────────────────────────────────────────────

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(dir) {
  const xml = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
  return xml.split("<si>").slice(1).map((si) => {
    const chunk = si.split("</si>")[0];
    let text = "";
    for (const m of chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
    return decodeXml(text);
  });
}

function parseSheet(dir, file, strings) {
  const xml = readFileSync(join(dir, "xl/worksheets", file), "utf8");
  const rows = [];
  for (const rowM of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    // Self-closing <c/> cells mark blanks; missing them shifts every later column.
    for (const cM of rowM[2].matchAll(/<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cM[1] ?? cM[2];
      const body = cM[3] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      let val = "";
      if (type === "s") {
        const idx = body.match(/<v>(\d+)<\/v>/)?.[1];
        val = idx != null ? strings[+idx] : "";
      } else if (type === "inlineStr") {
        let t = "";
        for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += m[1];
        val = decodeXml(t);
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        val = v != null ? decodeXml(v) : "";
      }
      if (ref) cells[colIndex(ref)] = val;
    }
    rows.push(cells);
  }
  return rows;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const COL = {
  brandKey: 0, postUrl: 1, text: 2, imageUrl: 3, videoUrl: 4,
  comments: 5, likes: 6, hashtags: 7, location: 8, handle: 9,
  maxResults: 10, date: 11, time: 12, mentions: 14,
};

const normHandle = (h) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();

// Confirmed-official handles that sheet 1 doesn't list, keyed by the brand they belong to.
// Reviewed 2026-08-27 on the engagement evidence, which is unambiguous: these two accounts
// carry 5 posts each at 461,806 and 55,055 total engagement, while the other prefix-matched
// handles (vilvahsjswethasstore, vilvah.us, kamaayurveda.ao) carry 54, 7 and 7 across 14
// posts — reseller-shop numbers, not brand numbers. Sheet 1's @vilvah posted nothing at all,
// so it is a stale handle. Anything not listed here stays in handleReview.
const OFFICIAL_ALIASES = new Map([
  ["vilvah_", "vilvah"],
  ["kamaayurvedaindia", "kamaayurveda"],
]);

/** Posts older than this are flagged `stale` — the workbook reaches back to 2016. */
const STALE_BEFORE = process.env.STALE_BEFORE ?? "2025-01-01";

/** Excel serial date → ISO date. Epoch is 1899-12-30 (Lotus 1-2-3 leap-year bug). */
function serialToISO(serial) {
  const n = Number(serial);
  if (!n || Number.isNaN(n)) return null;
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
}

/** -1 is the scraper's "unknown" sentinel; treat as missing, not as a real count. */
function count(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePyList(s) {
  const raw = String(s ?? "").trim();
  if (!raw || raw === "[]") return [];
  return [...raw.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
}

function firstLine(text, max = 180) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── main ──────────────────────────────────────────────────────────────────────

const xlsxPath = process.argv[2];
const outDir = process.argv[3] ?? "seed";
if (!xlsxPath) {
  console.error('Usage: node scripts/extract-mr-workbook.mjs "<path to .xlsx>" [outDir]');
  process.exit(1);
}

const workDir = join(tmpdir(), `mrx-${Date.now()}`);
mkdirSync(workDir, { recursive: true });
// .NET's ZipFile, not Expand-Archive: the latter rejects any extension but .zip,
// and an .xlsx is a zip wearing a different hat.
execFileSync("powershell", [
  "-NoProfile", "-Command",
  "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
    `[System.IO.Compression.ZipFile]::ExtractToDirectory('${xlsxPath.replace(/'/g, "''")}', '${workDir}')`,
]);

const strings = parseSharedStrings(workDir);
const brandRows = parseSheet(workDir, "sheet1.xml", strings).slice(1);
const postRows = parseSheet(workDir, "sheet2.xml", strings).slice(1);

// Brand table: official handle -> display name.
const brands = [];
const officialToBrand = new Map();
for (const r of brandRows) {
  const name = String(r[0] ?? "").trim();
  const handle = normHandle(r[1]);
  if (!name || !handle) continue;
  brands.push({ brand: name, officialHandle: handle });
  officialToBrand.set(handle, name);
}

const posts = [];
for (const r of postRows) {
  const brandKey = normHandle(r[COL.brandKey]);
  const handle = normHandle(r[COL.handle]);
  const url = String(r[COL.postUrl] ?? "").trim();
  if (!url) continue;

  const likes = count(r[COL.likes]);
  const comments = count(r[COL.comments]);
  const exact = handle === brandKey && officialToBrand.has(brandKey);
  const aliased = OFFICIAL_ALIASES.get(handle) === brandKey;
  const isAuthentic = exact || aliased;

  // Prefix-related but neither equal nor an approved alias: reviewable, never auto-promoted.
  const a = brandKey.replace(/[^a-z]/g, "");
  const b = handle.replace(/[^a-z]/g, "");
  const isNearMiss = !isAuthentic && a && b && (b.startsWith(a) || a.startsWith(b));

  posts.push({
    brand: officialToBrand.get(brandKey) ?? brandKey,
    brandKey,
    postUrl: url,
    handle,
    authentic: isAuthentic,
    authenticVia: exact ? "exact" : aliased ? "alias" : undefined,
    handleReview: isNearMiss || undefined,
    // Seeding hint, NOT a PRD classification. Direct = the category's own brands
    // posting; the PRD's Adjacent means creative from OUTSIDE the category, which this
    // workbook does not contain — these are creator/reseller posts about the same
    // brands. Flip them if you want a stricter read of Adjacent.
    suggestedBucket: isAuthentic ? "direct" : "adjacent",
    caption: firstLine(r[COL.text]),
    // The scraper re-hosted each still to public GCS (verified 200), so this is a
    // stable thumbnail that does NOT depend on Instagram oEmbed or survive-the-post.
    imageUrl: String(r[COL.imageUrl] ?? "").trim() || null,
    // Instagram CDN video links are signed and short-lived — treat as already expired.
    videoUrl: String(r[COL.videoUrl] ?? "").trim() || null,
    isVideo: !!String(r[COL.videoUrl] ?? "").trim(),
    likes,
    comments,
    engagement: (likes ?? 0) + (comments ?? 0),
    datePosted: serialToISO(r[COL.date]),
    timePosted: String(r[COL.time] ?? "").trim() || null,
    // Market signal decays. Flagged, not dropped — MR decides what is too old.
    stale: (serialToISO(r[COL.date]) ?? "9999") < STALE_BEFORE,
    hashtags: parsePyList(r[COL.hashtags]),
    mentions: parsePyList(r[COL.mentions]),
    location: String(r[COL.location] ?? "").trim() || null,
  });
}

const authentic = posts
  .filter((p) => p.authentic)
  .sort((a, b) => b.engagement - a.engagement);

const review = posts.filter((p) => p.handleReview).sort((a, b) => b.engagement - a.engagement);

// ── Selection: authentic first, top-performers only as a fallback ─────────────
//
// Two routes into the shelf, applied PER BRAND:
//   1. the brand's own account posted it, or
//   2. the brand has no authentic posts at all — then take its top TOP_PERCENT by
//      engagement, so a brand whose scrape caught only resellers still contributes.
//
// The fallback is per-brand, not global: a single global ranking would hand every
// slot to Vilvah's 460k outlier and leave nine brands unrepresented.
const TOP_PERCENT = Number(process.env.TOP_PERCENT ?? 10);

const byBrand = new Map();
for (const p of posts) {
  if (!byBrand.has(p.brandKey)) byBrand.set(p.brandKey, []);
  byBrand.get(p.brandKey).push(p);
}

const selected = [];
const brandSummary = [];
for (const [brandKey, brandPosts] of byBrand) {
  const brandAuthentic = brandPosts.filter((p) => p.authentic);
  let picked;
  let reason;
  if (brandAuthentic.length) {
    picked = [...brandAuthentic].sort((a, b) => b.engagement - a.engagement);
    reason = "authentic";
  } else {
    const n = Math.max(1, Math.ceil((brandPosts.length * TOP_PERCENT) / 100));
    picked = [...brandPosts].sort((a, b) => b.engagement - a.engagement).slice(0, n);
    reason = "top_performing";
  }
  for (const p of picked) selected.push({ ...p, selectionReason: reason });
  brandSummary.push({
    brand: picked[0]?.brand ?? brandKey,
    brandKey,
    totalPosts: brandPosts.length,
    authenticPosts: brandAuthentic.length,
    selected: picked.length,
    via: reason,
  });
}

// One row per post: a URL can qualify twice, and seeding it twice would create two
// references to the same reel.
const seen = new Set();
const references = selected
  .sort((a, b) => b.engagement - a.engagement)
  .filter((p) => (seen.has(p.postUrl) ? false : seen.add(p.postUrl)));

// Kept for reference/analysis, not for seeding.
const topPerforming = [...posts].sort((a, b) => b.engagement - a.engagement).slice(0, 60);

const stats = {
  totalPosts: posts.length,
  brandsInTable: brands.length,
  brandsWithPosts: byBrand.size,
  authenticPosts: authentic.length,
  handleReviewPosts: review.length,
  selectedReferences: references.length,
  selectedViaAuthentic: references.filter((p) => p.selectionReason === "authentic").length,
  selectedViaTopPerforming: references.filter((p) => p.selectionReason === "top_performing").length,
  selectedStale: references.filter((p) => p.stale).length,
  selectedWithThumbnail: references.filter((p) => p.imageUrl).length,
  postsWithVideo: posts.filter((p) => p.isVideo).length,
  missingLikes: posts.filter((p) => p.likes == null).length,
  dateRange: [
    posts.map((p) => p.datePosted).filter(Boolean).sort()[0],
    posts.map((p) => p.datePosted).filter(Boolean).sort().at(-1),
  ],
  caveats: [
    "The workbook has no views/reach column — 'top performing' ranks on likes + comments only.",
    "Authenticity is an exact handle match, plus two reviewed aliases (vilvah_, kamaayurvedaindia) whose engagement makes them unmistakably the brand's own accounts. Every other prefix-similar handle stays in handleReview — they are reseller shops.",
    "Only 7 of 12 brands have any authentic posts: the scrape captured resellers rather than the brand for Forest Essentials, Himalaya, SoulTree, Juicy Chemistry and Lotus Herbals.",
    "Likes of -1 in the source mean unknown; they are null here and count as 0 for ranking.",
    `Selection is per brand: authentic posts when the brand has any, otherwise that brand's top ${TOP_PERCENT}% by engagement. A global ranking would have given nearly every slot to one Vilvah outlier.`,
    "Every brand was scraped with max_results=50, so 'top performing' means top within a 50-post sample — not the brand's true best.",
    `Posts before ${STALE_BEFORE} are flagged stale (the workbook reaches back to 2016); they are kept, not dropped.`,
    "videoUrl values are signed Instagram CDN links and are almost certainly expired. imageUrl points at the scraper's public GCS copy (verified reachable) and is the dependable thumbnail.",
  ],
};

mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, "market-seed.json"),
  JSON.stringify(
    {
      source: basename(xlsxPath),
      stats,
      brands,
      brandSummary,
      // `references` is the seedable set — dedupped, one row per post.
      references,
      // Kept for analysis; both overlap `references` by design.
      authentic,
      topPerforming,
      handleReview: review,
    },
    null,
    2,
  ),
);

const CSV_COLS = [
  "brand", "handle", "selectionReason", "authentic", "authenticVia", "suggestedBucket",
  "postUrl", "imageUrl", "isVideo", "likes", "comments", "engagement", "datePosted", "stale", "caption",
];
writeFileSync(
  join(outDir, "market-seed.csv"),
  [
    CSV_COLS.join(","),
    ...references.map((p) => CSV_COLS.map((c) => csvCell(p[c] ?? "")).join(",")),
  ].join("\n"),
);

console.log(JSON.stringify(stats, null, 2));
console.log("\nPer brand:");
for (const b of brandSummary.sort((a, b2) => a.brand.localeCompare(b2.brand))) {
  console.log(
    `  ${b.brand.padEnd(20)} ${String(b.selected).padStart(2)} selected  via ${b.via.padEnd(15)}` +
      ` (${b.authenticPosts} authentic of ${b.totalPosts} scraped)`,
  );
}
const missing = brands.filter((b) => !byBrand.has(b.officialHandle));
if (missing.length) console.log(`\n  no posts at all: ${missing.map((b) => b.brand).join(", ")}`);
console.log(`\nWrote ${outDir}/market-seed.json and ${outDir}/market-seed.csv`);
console.log(`  references (seedable): ${references.length}`);
