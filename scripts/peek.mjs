// Temp: dump the eval traces for open coding. New model = ONE node per shot, so we
// read all prompt nodes on the eval-harness canvas and join each node's ACTIVE version.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: client } = await sb.from("clients").select("id").eq("slug", "prakriti-satva").single();
const { data: canvas } = await sb
  .from("canvases").select("id").eq("client_id", client.id).eq("slug", "eval-harness").single();

const { data: nodes } = await sb
  .from("nodes")
  .select("id, data, active_version_id")
  .eq("canvas_id", canvas.id)
  .eq("type", "prompt");

const activeIds = nodes.map((n) => n.active_version_id).filter(Boolean);
const { data: versions } = await sb
  .from("node_versions")
  .select("id, inputs_used, generated_output, decision, note")
  .in("id", activeIds);
const vById = Object.fromEntries(versions.map((v) => [v.id, v]));

const rows = nodes
  .map((n) => ({ data: n.data, v: vById[n.active_version_id] }))
  .filter((r) => r.v)
  .sort((a, b) => (a.data.scriptNum ?? 0) - (b.data.scriptNum ?? 0));

for (const { data, v } of rows) {
  const i = v.inputs_used ?? {};
  console.log("\n" + "=".repeat(90));
  console.log(`#${i.scriptNum} [${i.reelType}] ${i.scriptTitle} — shot ${i.shotIndex}   [${data.evalKey}]`);
  const label = v.decision ? `  → ${v.decision}${v.note ? `: ${v.note}` : ""}` : "  (unlabelled)";
  console.log("-".repeat(90) + label);
  console.log(v.generated_output);
}
console.log("\n" + "=".repeat(90));
console.log(`TOTAL nodes: ${nodes.length} | with active version: ${rows.length}`);
