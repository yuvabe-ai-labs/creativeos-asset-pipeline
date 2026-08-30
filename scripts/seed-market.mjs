// Seeds a client's Market shelf from seed/market-seed.json (see extract-mr-workbook.mjs).
//
//   node scripts/seed-market.mjs <client-slug> [--dry] [--file seed/market-seed.json]
//
// Writes moodboard_items directly rather than POSTing the API, for two reasons:
//   1. The API is session-authenticated; a CLI has no cookie.
//   2. The workbook already carries a PUBLIC re-hosted still per post, so we can set
//      thumbnail_url outright and skip the oEmbed + GCS round-trip the live ingest
//      path does. Seeding therefore can't fail on an Instagram rate limit.
//
// Idempotent: a post already on the board is skipped, so re-running tops up.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env: .env is what use-env.mjs writes (staging/production); .env.local is the
// legacy single-target file, kept as a fallback for anyone who still has one.
function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    try {
      const text = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
      const env = {};
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        return { env, name };
      }
    } catch {
      /* try the next candidate */
    }
  }
  console.error("No .env or .env.local with Supabase credentials found.");
  process.exit(1);
}

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const fileArg = args.indexOf("--file");
const seedFile = fileArg >= 0 ? args[fileArg + 1] : "seed/market-seed.json";

if (!slug) {
  console.error("Usage: node scripts/seed-market.mjs <client-slug> [--dry] [--file <path>]");
  process.exit(1);
}

const { env, name: envName } = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? "?";
console.log(`env: ${envName}  →  supabase project ${projectRef}`);
console.log(`seed file: ${seedFile}${dry ? "   [DRY RUN — no writes]" : ""}\n`);

const seed = JSON.parse(readFileSync(new URL(`../${seedFile}`, import.meta.url), "utf8"));
const refs = seed.references ?? [];
if (!refs.length) {
  console.error("Seed file has no `references`.");
  process.exit(1);
}

// ── client ───────────────────────────────────────────────────────────────────
const { data: client, error: clientErr } = await supabase
  .from("clients")
  .select("id, name, slug")
  .eq("slug", slug)
  .maybeSingle();
if (clientErr) {
  console.error("client lookup failed:", clientErr.message);
  process.exit(1);
}
if (!client) {
  const { data: all } = await supabase.from("clients").select("slug").order("slug");
  console.error(`No client with slug "${slug}". Available: ${(all ?? []).map((c) => c.slug).join(", ")}`);
  process.exit(1);
}
console.log(`client: ${client.name} (${client.slug})`);

// ── system boards (mirrors ensureSystemBoards in src/lib/db/moodboards.ts) ────
async function ensureBoard(boardType, boardName) {
  const { data: existing } = await supabase
    .from("moodboards")
    .select("id")
    .eq("client_id", client.id)
    .eq("board_type", boardType)
    .maybeSingle();
  if (existing) return existing.id;
  if (dry) return `(would create ${boardType})`;
  const { data, error } = await supabase
    .from("moodboards")
    .insert({ client_id: client.id, name: boardName, board_type: boardType })
    .select("id")
    .single();
  if (error) {
    console.error(`could not create ${boardType} board:`, error.message);
    process.exit(1);
  }
  return data.id;
}

const boards = {
  direct: await ensureBoard("direct", "Direct"),
  adjacent: await ensureBoard("adjacent", "Adjacent"),
};
console.log(`boards: direct=${boards.direct}  adjacent=${boards.adjacent}\n`);

// ── existing items, so a re-run tops up instead of duplicating ───────────────
const { data: existingItems } = await supabase
  .from("moodboard_items")
  .select("image_url, moodboard_id")
  .in("moodboard_id", Object.values(boards).filter((v) => typeof v === "string" && v.includes("-")));
const already = new Set((existingItems ?? []).map((i) => i.image_url));

// ── build rows ───────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("en-US");

/** MR's voice on the tile: who posted, how it did, then the post's own opening line. */
function buildNote(p) {
  const bits = [`@${p.handle}`];
  if (p.engagement) bits.push(`${fmt.format(p.engagement)} engagement`);
  if (p.datePosted) bits.push(p.datePosted);
  if (p.selectionReason === "top_performing") bits.push("top 10% (no brand posts scraped)");
  if (p.stale) bits.push("older post");
  const head = bits.join(" · ");
  return p.caption ? `${head} — ${p.caption}` : head;
}

const rows = [];
let skipped = 0;
for (const p of refs) {
  if (already.has(p.postUrl)) {
    skipped++;
    continue;
  }
  const boardId = boards[p.suggestedBucket];
  if (!boardId) continue;
  rows.push({
    moodboard_id: boardId,
    image_url: p.postUrl,
    source_url: p.postUrl,
    // Every reference is an instagram.com/p/… permalink; the app's classifier
    // (src/lib/market/classify.ts) maps that shape to "instagram".
    kind: "instagram",
    // The scraper's public GCS still — no oEmbed needed, and it outlives the post.
    thumbnail_url: p.imageUrl ?? null,
    note: buildNote(p),
    added_by: null,
  });
}

const counts = rows.reduce((acc, r) => {
  const b = r.moodboard_id === boards.direct ? "direct" : "adjacent";
  acc[b] = (acc[b] ?? 0) + 1;
  return acc;
}, {});
console.log(`to insert: ${rows.length}  (direct=${counts.direct ?? 0}, adjacent=${counts.adjacent ?? 0})`);
console.log(`already present, skipped: ${skipped}`);
console.log(`without a thumbnail: ${rows.filter((r) => !r.thumbnail_url).length}`);

if (dry) {
  console.log("\nSample row:");
  console.log(JSON.stringify(rows[0], null, 2));
  console.log("\n[DRY RUN] nothing written.");
  process.exit(0);
}

// ── insert in chunks ─────────────────────────────────────────────────────────
let inserted = 0;
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50);
  const { error } = await supabase.from("moodboard_items").insert(chunk);
  if (error) {
    console.error(`insert failed at row ${i}:`, error.message);
    process.exit(1);
  }
  inserted += chunk.length;
}

console.log(`\n✓ inserted ${inserted} references for ${client.name}`);
console.log(`  open /clients/${client.slug}/market`);
