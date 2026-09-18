// Read-only: what state is the archive backlog actually in?
// Usage: node scripts/archive-status.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\nProject: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname}\n`);

const { data, error } = await sb
  .from("moodboard_items")
  .select("kind, archive_status, media_url, media_bytes, media_type, thumbnail_url, archive_error");
if (error) throw error;

// status x kind grid
const grid = {};
for (const r of data) {
  (grid[r.kind] ??= {})[r.archive_status] = ((grid[r.kind] ?? {})[r.archive_status] ?? 0) + 1;
}
const statuses = ["pending", "downloading", "ready", "failed", "skipped"];
console.log("kind".padEnd(12) + statuses.map((s) => s.padStart(12)).join(""));
console.log("-".repeat(12 + 12 * statuses.length));
for (const [kind, counts] of Object.entries(grid).sort()) {
  console.log(kind.padEnd(12) + statuses.map((s) => String(counts[s] ?? 0).padStart(12)).join(""));
}

const ready = data.filter((r) => r.archive_status === "ready");
console.log(`\nArchived: ${ready.length} file(s)`);
for (const r of ready) {
  const mb = ((r.media_bytes ?? 0) / 1024 / 1024).toFixed(2);
  const ours = r.media_url?.includes("storage.googleapis.com") ? "OURS" : "NOT OURS";
  console.log(`  ${r.kind.padEnd(10)} ${mb.padStart(7)} MB  ${String(r.media_type).padEnd(12)} ${ours}`);
}

const failed = data.filter((r) => r.archive_status === "failed");
if (failed.length) {
  console.log(`\nFailed: ${failed.length}`);
  for (const r of failed.slice(0, 10)) console.log(`  ${r.kind.padEnd(10)} ${r.archive_error}`);
}

// D272: how many items still have no preview at all?
const noThumb = data.filter((r) => !r.thumbnail_url);
const byKind = {};
for (const r of noThumb) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(`\nStill missing a thumbnail: ${noThumb.length}`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`  ${k.padEnd(10)} ${n}`);
console.log();
