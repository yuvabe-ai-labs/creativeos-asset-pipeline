// Clears every moodboard for one client — boards, their items (FK cascade), and
// the client's signal groups (deleted explicitly: signals only cascade off the
// client row, so a board wipe alone would leave empty groups on the shelf).
//
//   node scripts/clear-moodboards.mjs <client-slug> [--env staging|production] [--yes]
//
// Dry-run by default: prints what would be deleted and exits. --yes deletes.
// Without --env, reads .env then .env.local (same resolution as seed-market.mjs);
// with --env, reads .env.<name> directly so you don't have to swap .env first.
//
// The Direct/Adjacent system boards are NOT recreated here — the app lazily
// re-provisions them on the next Market page visit (ensureSystemBoards, D186).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(envName) {
  const candidates = envName ? [`.env.${envName}`] : [".env", ".env.local"];
  for (const name of candidates) {
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
  throw new Error(
    `No env file with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY among: ${candidates.join(", ")}`,
  );
}

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const yes = args.includes("--yes");
const envIdx = args.indexOf("--env");
const envName = envIdx >= 0 ? args[envIdx + 1] : null;

if (!slug || (envName && !["staging", "production"].includes(envName))) {
  console.error("Usage: node scripts/clear-moodboards.mjs <client-slug> [--env staging|production] [--yes]");
  process.exit(1);
}

const { env, name: envFile } = loadEnv(envName);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
console.log(`Target: ${env.NEXT_PUBLIC_SUPABASE_URL} (from ${envFile})\n`);

const { data: client, error: clientErr } = await supabase
  .from("clients")
  .select("id, name, slug")
  .eq("slug", slug)
  .maybeSingle();
if (clientErr) throw clientErr;
if (!client) {
  console.error(`No client with slug "${slug}".`);
  process.exit(1);
}

// board_type landed in migration 0034 — retry without it on an older database.
let boards;
{
  let res = await supabase
    .from("moodboards")
    .select("id, name, board_type, moodboard_items(count)")
    .eq("client_id", client.id)
    .order("created_at", { ascending: true });
  if (res.error && res.error.code === "42703") {
    res = await supabase
      .from("moodboards")
      .select("id, name, moodboard_items(count)")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true });
  }
  if (res.error) throw res.error;
  boards = res.data;
}

// signals landed in migration 0034 — tolerate a database that predates it.
let signals = [];
{
  const { data, error } = await supabase.from("signals").select("id, name").eq("client_id", client.id);
  // 42P01 = undefined table (raw Postgres), PGRST205 = table not in PostgREST's schema cache.
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
  signals = data ?? [];
}

console.log(`Client: ${client.name} (${client.slug})`);
if (!boards.length && !signals.length) {
  console.log("Nothing to delete — no moodboards or signals.");
  process.exit(0);
}
for (const b of boards) {
  const count = b.moodboard_items?.[0]?.count ?? 0;
  console.log(`  board  ${b.name} [${b.board_type ?? "pre-0034"}] — ${count} item(s)`);
}
for (const s of signals) console.log(`  signal ${s.name}`);

if (!yes) {
  console.log("\nDry run — nothing deleted. Re-run with --yes to delete all of the above.");
  process.exit(0);
}

if (signals.length) {
  const { error } = await supabase.from("signals").delete().eq("client_id", client.id);
  if (error) throw error;
}
const { error: delErr } = await supabase.from("moodboards").delete().eq("client_id", client.id);
if (delErr) throw delErr;

console.log(`\n✓ Deleted ${boards.length} board(s) (items cascade) and ${signals.length} signal(s).`);
