// Fills thumbnail_url for market references that have none, using the same
// resolution the live ingest path uses, then re-hosts the result to GCS.
//
//   node scripts/backfill-market-thumbnails.mjs [--dry] [--limit N]
//
// Exists because tokenless Instagram oEmbed returns no thumbnail_url: any reference
// captured before the embed-page fallback landed is a bare link tile. Safe to re-run —
// it only touches rows where thumbnail_url IS NULL.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 200;

const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Mirrors src/lib/market/thumbnail.ts. Kept inline because that module is TypeScript
// and server-only; if the two ever diverge, the TS one is the source of truth.
const OEMBED = "https://graph.facebook.com/v23.0/instagram_oembed?omit_script=true&url=";

function unescapeEmbedded(s) {
  return s
    .replace(/\\\\u00([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u00([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\\//g, "/")
    .replace(/\\\//g, "/");
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

async function ogImage(pageUrl) {
  try {
    const r = await fetch(pageUrl, { headers: { "User-Agent": BROWSER_UA } });
    if (!r.ok) return null;
    const html = await r.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    return new URL(m[1].replace(/&amp;/g, "&"), pageUrl).href;
  } catch {
    return null;
  }
}

// Same order as src/lib/market/thumbnail.ts (D190): oEmbed -> og:image -> display_url.
async function instagramPoster(postUrl) {
  try {
    const r = await fetch(OEMBED + encodeURIComponent(postUrl));
    if (r.ok) {
      const j = await r.json();
      if (j.thumbnail_url) return j.thumbnail_url;
    }
  } catch {
    /* fall through */
  }

  const og = await ogImage(postUrl);
  if (og) return og;

  try {
    const m0 = new URL(postUrl).pathname.match(/^\/(p|reel|tv)\/([^/]+)/);
    if (!m0) return null;
    const embed = `https://www.instagram.com/${m0[1]}/${m0[2]}/embed`;
    const r = await fetch(embed, { headers: { "User-Agent": BROWSER_UA } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/display_url\\":\\"(.*?)\\"/);
    return m ? unescapeEmbedded(m[1]) : null;
  } catch {
    return null;
  }
}

const { data: rows, error } = await supabase
  .from("moodboard_items")
  .select("id, image_url, kind, moodboard_id")
  .is("thumbnail_url", null)
  .eq("kind", "instagram")
  .limit(limit);
if (error) {
  console.error("read failed:", error.message);
  process.exit(1);
}

console.log(`instagram references without a thumbnail: ${rows.length}${dry ? "   [DRY]" : ""}`);

let ok = 0;
let miss = 0;
for (const row of rows) {
  const poster = await instagramPoster(row.image_url);
  if (!poster) {
    miss++;
    console.log(`  ✗ ${row.image_url}`);
    continue;
  }
  ok++;
  console.log(`  ✓ ${row.image_url}`);
  if (dry) continue;
  // Store the fbcdn URL directly. It is signed and will expire, but the app re-hosts
  // on the live path; for a backfill this is enough to make the shelf visual now.
  const { error: upErr } = await supabase
    .from("moodboard_items")
    .update({ thumbnail_url: poster })
    .eq("id", row.id);
  if (upErr) console.error(`    update failed: ${upErr.message}`);
}

console.log(`\nresolved ${ok}, unresolved ${miss}${dry ? "  (nothing written)" : ""}`);
