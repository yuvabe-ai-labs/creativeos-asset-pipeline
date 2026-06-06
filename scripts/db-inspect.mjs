// Dev utility: inspect current DB contents (counts + node types). Read-only.
//   node scripts/db-inspect.mjs
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

const head = { count: "exact", head: true };
const clients = await supabase.from("clients").select("*", head);
const canvases = await supabase.from("canvases").select("*", head);
const versions = await supabase.from("node_versions").select("*", head);

const { data: nodes, error } = await supabase.from("nodes").select("id, type");
if (error) {
  console.error("nodes error:", error.message);
  process.exit(1);
}
const byType = {};
for (const n of nodes ?? []) byType[n.type] = (byType[n.type] ?? 0) + 1;

console.log("clients       :", clients.count ?? 0);
console.log("canvases      :", canvases.count ?? 0);
console.log("nodes         :", nodes?.length ?? 0);
console.log("nodes by type :", byType);
console.log("node_versions :", versions.count ?? 0);
