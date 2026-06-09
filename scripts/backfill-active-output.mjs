// One-time backfill (D19): fold each node's data.parsed into its ACTIVE version's
// output, so dropping the data.parsed cache loses no manual edits.
//   node scripts/backfill-active-output.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: nodes, error } = await supabase
  .from("nodes")
  .select("id, data, active_version_id");
if (error) {
  console.error("read nodes failed:", error.message);
  process.exit(1);
}

let updated = 0;
let skippedNoActive = 0;
let skippedNoParsed = 0;
for (const n of nodes ?? []) {
  const parsed = n.data?.parsed;
  if (parsed === undefined || parsed === null) {
    skippedNoParsed++;
    continue;
  }
  if (!n.active_version_id) {
    skippedNoActive++;
    console.warn(`node ${n.id}: has data.parsed but no active version — skipped`);
    continue;
  }
  const { error: upErr } = await supabase
    .from("node_versions")
    .update({ output: parsed })
    .eq("id", n.active_version_id);
  if (upErr) {
    console.error(`node ${n.id}: update failed:`, upErr.message);
    process.exit(1);
  }
  updated++;
}

console.log("backfill complete");
console.log("  updated            :", updated);
console.log("  skipped (no parsed):", skippedNoParsed);
console.log("  skipped (no active):", skippedNoActive);
