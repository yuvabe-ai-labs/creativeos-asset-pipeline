// Seeds one script for a client from a fixture (spec 1 §6). Developer-only: there is no button for
// this in the product, so the copilot stays the only way a user makes a script.
//
//   node scripts/seed-script.mjs <client-slug> [--file src/lib/scripts/fixtures/reel-01.json]
//        [--stage approved|visualise|in_review|generate] [--lead-avatar <avatar-uuid>] [--dry]
//
// Writes client_scripts directly with the service-role key (the API is session-authenticated).
// Idempotent: a live script with the same reel number and title for this client is updated in
// place, not duplicated. The app validates the doc on every read (scriptDocSchema), so a broken
// fixture shows up as a skipped row and a console warning, never a crash.
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

const STAGES = ["generate", "visualise", "in_review", "approved"];
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const slug = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const file = flag("--file", "src/lib/scripts/fixtures/reel-01.json");
const stage = flag("--stage", "approved");
const leadAvatar = flag("--lead-avatar", null);
const dry = args.includes("--dry");

if (!slug || !STAGES.includes(stage)) {
  console.error("Usage: node scripts/seed-script.mjs <client-slug> [--file <path>] [--stage <stage>] [--lead-avatar <uuid>] [--dry]");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const leads = (doc.cast ?? []).filter((c) => c.isLead);
if (leads.length !== 1) {
  console.error(`The fixture needs exactly one lead; it has ${leads.length}.`);
  process.exit(1);
}
if (leadAvatar) leads[0].avatarId = leadAvatar;

const { env, name } = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
console.log(`Using ${name} → ${env.NEXT_PUBLIC_SUPABASE_URL}`);

const { data: client, error: clientError } = await supabase.from("clients").select("id, name").eq("slug", slug).maybeSingle();
if (clientError) throw clientError;
if (!client) {
  console.error(`No client with slug "${slug}".`);
  process.exit(1);
}
if (leadAvatar) {
  const { data: avatar } = await supabase.from("client_avatars").select("id").eq("id", leadAvatar).eq("client_id", client.id).maybeSingle();
  if (!avatar) {
    console.error(`Avatar ${leadAvatar} is not one of ${client.name}'s avatars.`);
    process.exit(1);
  }
}

const { data: existing, error: listError } = await supabase
  .from("client_scripts").select("id, doc").eq("client_id", client.id).is("archived_at", null);
if (listError) throw listError;
const match = (existing ?? []).find(
  (r) => r.doc?.header?.reelNumber === doc.header.reelNumber && r.doc?.header?.title === doc.header.title,
);

const row = {
  client_id: client.id,
  stage,
  doc,
  approved_at: stage === "approved" ? new Date().toISOString() : null,
  updated_at: new Date().toISOString(),
};

if (dry) {
  console.log(`[dry] would ${match ? `update ${match.id}` : "insert"} "${doc.header.title}" for ${client.name} at stage ${stage}.`);
  process.exit(0);
}

const result = match
  ? await supabase.from("client_scripts").update(row).eq("id", match.id).select("id").single()
  : await supabase.from("client_scripts").insert(row).select("id").single();
if (result.error) throw result.error;
console.log(`${match ? "Updated" : "Inserted"} "${doc.header.title}" (${result.data.id}) for ${client.name}, stage ${stage}.`);
