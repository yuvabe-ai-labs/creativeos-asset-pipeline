// Seeds a client's market signals from a JSON file, for the script copilot's Market Research card
// (spec 2 §6). Developer-only demo data: every seeded signal carries the tag "demo".
//
//   node scripts/seed-signals.mjs <client-slug> [--file seed/signals-jackfruit-365.json] [--dry]
//
// Each entry is { name, tags, description }. Signals describe WHERE and WHEN people post around an
// occasion, never claims, proof or product uses (D255). Idempotent: a signal with the same name for
// this client is updated in place, not duplicated. No evidence items are attached.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    try {
      const text = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
      const env = {};
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return { env, name };
    } catch {
      /* try the next candidate */
    }
  }
  console.error("No .env or .env.local with Supabase credentials found.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const slug = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const file = flag("--file", "seed/signals-jackfruit-365.json");
const dry = args.includes("--dry");
if (!slug) {
  console.error("Usage: node scripts/seed-signals.mjs <client-slug> [--file <path>] [--dry]");
  process.exit(1);
}

const entries = JSON.parse(readFileSync(file, "utf8"));
for (const e of entries) {
  if (!e.name?.trim() || !Array.isArray(e.tags) || typeof e.description !== "string") {
    console.error(`Bad entry: ${JSON.stringify(e).slice(0, 80)}`);
    process.exit(1);
  }
}

const { env, name } = loadEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: client, error: clientError } = await db.from("clients").select("id, name").eq("slug", slug).maybeSingle();
if (clientError) throw clientError;
if (!client) { console.error(`No client with slug "${slug}".`); process.exit(1); }

const { data: existing, error: listError } = await db.from("signals").select("id, name").eq("client_id", client.id);
if (listError) throw listError;
const byName = new Map((existing ?? []).map((s) => [s.name, s.id]));

console.log(`${client.name} (${slug}), env ${name}: ${entries.length} signals`);
for (const e of entries) {
  const tags = [...new Set(["demo", ...e.tags])];
  const row = { client_id: client.id, name: e.name.trim(), tags, description: e.description.trim(), updated_at: new Date().toISOString() };
  const id = byName.get(row.name);
  console.log(`  ${id ? "update" : "insert"}: ${row.name}`);
  if (dry) continue;
  const { error } = id
    ? await db.from("signals").update(row).eq("id", id)
    : await db.from("signals").insert(row);
  if (error) throw error;
}
console.log(dry ? "--dry: nothing written." : "Done.");
