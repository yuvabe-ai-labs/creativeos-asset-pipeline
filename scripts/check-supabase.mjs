// Dev utility: verify .env.local Supabase keys connect — prints NO secret values.
//   node scripts/check-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("NEXT_PUBLIC_SUPABASE_URL      :", url ? `set (${url.replace(/^https?:\/\//, "").slice(0, 12)}…)` : "MISSING");
console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY :", anon ? `set (len ${anon.length})` : "MISSING");
console.log("SUPABASE_SERVICE_ROLE_KEY     :", service ? `set (len ${service.length})` : "MISSING");

if (!url || !service) {
  console.log("\n✗ Missing required keys — check the variable names in .env.local");
  process.exit(1);
}

const supabase = createClient(url, service, { auth: { persistSession: false } });

const tables = ["clients", "canvases", "nodes", "node_versions", "edges"];
console.log("\nTables:");
let missing = 0;
for (const t of tables) {
  const { error } = await supabase.from(t).select("*").limit(0);
  if (!error) {
    console.log(`  ✓ ${t}`);
  } else if (/does not exist|Could not find the table|schema cache/i.test(error.message)) {
    console.log(`  ✗ ${t} — not found`);
    missing++;
  } else {
    console.log(`  ! ${t} — ${error.message}`);
    missing++;
  }
}
console.log(missing === 0 ? "\n✓ All tables present — schema is live." : `\n✗ ${missing} table(s) missing — re-run the migration.`);
process.exit(missing === 0 ? 0 : 1);
