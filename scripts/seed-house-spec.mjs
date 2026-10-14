// Writes a client's house spec into its brand KB's free-text Consistency Notes, where the script
// copilot reads it whole (spec 2 §4.1, answer 2c.1). Developer-only, for the demo: proper KB fields
// for locked lines, disclaimers and kits come later.
//
//   node scripts/seed-house-spec.mjs <client-slug> --outlines <path to the reel outline .md> [--dry]
//
// Takes §2 "House spec" of the outline document (from "**2\. House spec" up to "**Reel 01"),
// strips the .docx export's escapes and bold markers, and writes it as ONE string into the active
// KB version's image_analysis.brand_consistency_notes, in place, status "edited". Nothing else in
// the KB changes. Why not the KB page: an empty field there is edited as a comma-split list.
// Re-running Image Analysis rewrites this field; run this again afterwards.
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
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const slug = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const outlines = flag("--outlines");
const dry = args.includes("--dry");
if (!slug || !outlines) {
  console.error("Usage: node scripts/seed-house-spec.mjs <client-slug> --outlines <path> [--dry]");
  process.exit(1);
}

const md = readFileSync(outlines, "utf8");
const start = md.indexOf("**2\\. House spec");
const end = md.indexOf("**Reel 01");
if (start < 0 || end < 0) {
  console.error(`No "2. House spec" section found in ${outlines}`);
  process.exit(1);
}
const houseSpec = md
  .slice(start, end)
  .replace(/\\([#*_+.\-])/g, "$1") // the .docx export's escapes
  .replace(/\*\*/g, "") // bold markers
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const { env, name } = loadEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: client, error: clientError } = await db
  .from("clients").select("id, name, active_kb_version_id").eq("slug", slug).maybeSingle();
if (clientError) throw clientError;
if (!client) { console.error(`No client with slug "${slug}".`); process.exit(1); }
if (!client.active_kb_version_id) { console.error(`${client.name} has no active brand KB.`); process.exit(1); }

const { data: version, error: versionError } = await db
  .from("client_kb_versions").select("id, output").eq("id", client.active_kb_version_id).single();
if (versionError) throw versionError;

const output = version.output ?? {};
const imageAnalysis = output.image_analysis ?? {};
const next = {
  ...output,
  image_analysis: {
    ...imageAnalysis,
    brand_consistency_notes: { value: houseSpec, confidence: "high", evidence_type: "explicit", status: "edited" },
  },
};

console.log(`${client.name} (${slug}), KB version ${version.id}, env ${name}`);
console.log(`House spec: ${houseSpec.length} characters, starting "${houseSpec.slice(0, 60)}…"`);
if (dry) { console.log("--dry: nothing written."); process.exit(0); }

const { error: writeError } = await db.from("client_kb_versions").update({ output: next }).eq("id", version.id);
if (writeError) throw writeError;
console.log("Written to image_analysis.brand_consistency_notes.");
