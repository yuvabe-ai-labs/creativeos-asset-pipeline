// Verifies migration 0039 against whichever project .env points at.
// Read-only apart from one constraint probe, which inserts nothing (it relies on the
// CHECK rejecting or accepting before any row is written, then rolls back by deleting).
//
// Usage: node scripts/verify-0039.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Deliberately .env (not .env.local): `npm run env:staging` writes .env, so that is
// the file that says which project we are actually pointed at.
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

const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
console.log(`\nProject: ${host}\n`);

const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);
let failures = 0;

// 1. Do the new columns exist and are they readable?
console.log("-- columns --");
const NEW_COLS = [
  "media_url",
  "media_bytes",
  "media_type",
  "archive_status",
  "archive_error",
  "archive_attempts",
  "archive_started_at",
  "archived_at",
];
const { data: probe, error: probeErr } = await sb
  .from("moodboard_items")
  .select(NEW_COLS.join(","))
  .limit(1);
if (probeErr) {
  bad(`selecting the new columns failed: ${probeErr.message}`);
  failures++;
} else {
  ok(`all ${NEW_COLS.length} columns present and selectable`);
  if (probe?.[0]) {
    const row = probe[0];
    const missing = NEW_COLS.filter((c) => !(c in row));
    if (missing.length) {
      bad(`absent from the returned row: ${missing.join(", ")}`);
      failures++;
    }
  }
}

// 2. Is every pre-existing row queued for the backfill?
console.log("\n-- backfill queue --");
const { count: total } = await sb
  .from("moodboard_items")
  .select("*", { count: "exact", head: true });
const { count: pending } = await sb
  .from("moodboard_items")
  .select("*", { count: "exact", head: true })
  .eq("archive_status", "pending");
if (total === pending) {
  ok(`all ${total} existing rows are 'pending' — the sweep will backfill them`);
} else {
  bad(`${pending} of ${total} rows are 'pending' (expected all)`);
  failures++;
}

// 3. Does the kind CHECK now admit pinterest? This is the one the DO-block had to
// fix by definition rather than by a guessed constraint name — if the old constraint
// survived alongside the new one, this insert is rejected.
console.log("\n-- kind CHECK admits pinterest --");
const { data: board } = await sb.from("moodboards").select("id").limit(1).maybeSingle();
if (!board) {
  console.log("  (no moodboard to test against — skipped)");
} else {
  const { data: inserted, error: insErr } = await sb
    .from("moodboard_items")
    .insert({
      moodboard_id: board.id,
      image_url: "https://in.pinterest.com/pin/verify-0039/",
      kind: "pinterest",
    })
    .select("id, kind, archive_status")
    .single();
  if (insErr) {
    bad(`inserting kind='pinterest' was rejected: ${insErr.message}`);
    bad("the old kind CHECK probably survived — re-run the DO block in 0039");
    failures++;
  } else {
    ok(`kind='pinterest' accepted, and defaulted to '${inserted.archive_status}'`);
    await sb.from("moodboard_items").delete().eq("id", inserted.id);
    ok("probe row deleted");
  }
}

// 4. Does the status CHECK reject nonsense?
console.log("\n-- archive_status CHECK rejects an invalid value --");
if (board) {
  const { error: badErr } = await sb
    .from("moodboard_items")
    .insert({
      moodboard_id: board.id,
      image_url: "https://example.com/verify-0039",
      kind: "link",
      archive_status: "not-a-real-status",
    })
    .select("id")
    .single();
  if (badErr) ok("invalid archive_status correctly rejected");
  else {
    bad("an invalid archive_status was ACCEPTED — the CHECK is missing");
    failures++;
  }
}

console.log(
  failures === 0 ? "\n✓ Migration 0039 verified.\n" : `\n✗ ${failures} problem(s).\n`,
);
process.exit(failures === 0 ? 0 : 1);
