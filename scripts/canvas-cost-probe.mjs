// Read-only cost probe for ONE canvas: every generation run on it, what it really cost
// (vendor USD) vs what was billed (credits), split by node / type / model, plus how much
// of the spend went into the outputs that were kept vs. discarded re-rolls.
//
//   node scripts/canvas-cost-probe.mjs <client-slug> <canvas-slug> [options]
//
// Options:
//   --env=<name>   which .env.<name> file to read   (default: staging)
//   --runs         also list every individual run
//   --out=<path>   write the JSON report to a file
//
// Example (https://creativeos-yuvabe-staging.vercel.app/clients/jackfruit-365/canvases/reel-1):
//   node scripts/canvas-cost-probe.mjs jackfruit-365 reel-1
//
// Blind spots — spend this probe CANNOT see, because those routes call an LLM without
// writing a generations row: copilot (/api/copilot*), compose, parse, file/extract.
// Runs whose model is missing from the pricing tables (src/lib/pricing.ts,
// src/lib/image-gen/cost.ts, video pricing) settle with cost_usd = null; they are
// listed under "UNPRICED" rather than silently counted as $0.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- args + env

const args = process.argv.slice(2);
const [clientSlug, canvasSlug] = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (!clientSlug || !canvasSlug) {
  console.error(
    "Usage: node scripts/canvas-cost-probe.mjs <client-slug> <canvas-slug> [--env=staging] [--runs] [--out=path]",
  );
  process.exit(1);
}

const envName = flag("env", "staging");
let envText;
try {
  envText = readFileSync(new URL(`../.env.${envName}`, import.meta.url), "utf8");
} catch {
  console.error(`Missing env file: .env.${envName}`);
  process.exit(1);
}
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`.env.${envName} is missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------------ helpers

const die = (label, error) => {
  console.error(`${label}: ${error.message}`);
  process.exit(1);
};

async function selectIn(table, columns, column, ids, chunkSize = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(column, ids.slice(i, i + chunkSize));
    if (error) die(`${table} query failed`, error);
    out.push(...(data ?? []));
  }
  return out;
}

const num = (v) => (v == null ? 0 : Number(v));
const usd = (n) => `$${n.toFixed(4)}`;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const clip = (s, n) => (s.length > n - 1 ? `${s.slice(0, n - 2)}…` : s);

/** Group runs by a key and roll up count / USD / credits. */
function rollup(runs, keyOf) {
  const out = new Map();
  for (const g of runs) {
    const k = keyOf(g) ?? "—";
    const r = out.get(k) ?? { key: k, runs: 0, succeeded: 0, failed: 0, usd: 0, credits: 0, unpriced: 0 };
    r.runs += 1;
    if (g.status === "succeeded") r.succeeded += 1;
    if (g.status === "failed") r.failed += 1;
    r.usd += num(g.cost_usd);
    r.credits += num(g.credits_charged);
    if (g.status === "succeeded" && g.cost_usd == null) r.unpriced += 1;
    out.set(k, r);
  }
  return [...out.values()].sort((a, b) => b.usd - a.usd || b.runs - a.runs);
}

function printRollup(title, rows, keyWidth = 34) {
  console.log(`\n${title}\n`);
  console.log(
    `  ${pad("", keyWidth)} ${padL("RUNS", 5)} ${padL("OK", 4)} ${padL("FAIL", 5)} ${padL("USD", 10)} ${padL("CREDITS", 8)} ${padL("UNPRICED", 9)}`,
  );
  console.log(`  ${"─".repeat(keyWidth + 46)}`);
  for (const r of rows) {
    console.log(
      `  ${pad(clip(String(r.key), keyWidth), keyWidth)} ${padL(r.runs, 5)} ${padL(r.succeeded, 4)} ${padL(
        r.failed,
        5,
      )} ${padL(usd(r.usd), 10)} ${padL(r.credits, 8)} ${padL(r.unpriced || "", 9)}`,
    );
  }
}

// --------------------------------------------------------------- data fetch

const { data: client, error: clientErr } = await supabase
  .from("clients")
  .select("id, slug, name, org_id")
  .eq("slug", clientSlug)
  .maybeSingle();
if (clientErr) die("client query failed", clientErr);
if (!client) {
  console.error(`No client "${clientSlug}" in ${envName}.`);
  process.exit(1);
}

const { data: canvas, error: canvasErr } = await supabase
  .from("canvases")
  .select("id, slug, name, created_at, updated_at")
  .eq("client_id", client.id)
  .eq("slug", canvasSlug)
  .maybeSingle();
if (canvasErr) die("canvas query failed", canvasErr);
if (!canvas) {
  const { data: all } = await supabase.from("canvases").select("slug, name").eq("client_id", client.id);
  console.error(`No canvas "${canvasSlug}" under ${clientSlug}. Available:`);
  for (const c of all ?? []) console.error(`  ${c.slug}  —  ${c.name}`);
  process.exit(1);
}

const { data: nodes, error: nodesErr } = await supabase
  .from("nodes")
  .select("id, type, data, active_version_id")
  .eq("canvas_id", canvas.id);
if (nodesErr) die("nodes query failed", nodesErr);

const nodeIds = nodes.map((n) => n.id);
const runs = nodeIds.length
  ? await selectIn(
      "generations",
      "id, node_id, type, status, model_used, cost_usd, credits_charged, tokens_used, params_snapshot, version_id, error, created_at",
      "node_id",
      nodeIds,
    )
  : [];
runs.sort((a, b) => a.created_at.localeCompare(b.created_at));

// Ledger cross-check: the append-only credit_transactions rows for these runs should sum
// to the same credits as generations.credits_charged (reservation + refund + consumption).
const ledger = runs.length
  ? await selectIn("credit_transactions", "generation_id, amount, type", "generation_id", runs.map((g) => g.id))
  : [];

// ---------------------------------------------------------------- roll-up

const nodeById = new Map(nodes.map((n) => [n.id, n]));
const nodeLabel = (n) => {
  const d = n?.data ?? {};
  const name = d.label ?? d.title ?? d.name ?? "";
  return `${n?.type ?? "?"}${name ? ` · ${name}` : ""} [${n?.id.slice(0, 8)}]`;
};

// A run is "kept" when its output is what the node currently shows.
const activeVersionIds = new Set(nodes.map((n) => n.active_version_id).filter(Boolean));
const isKept = (g) => g.status === "succeeded" && g.version_id && activeVersionIds.has(g.version_id);

const totalUsd = runs.reduce((t, g) => t + num(g.cost_usd), 0);
const totalCredits = runs.reduce((t, g) => t + num(g.credits_charged), 0);
const keptRuns = runs.filter(isKept);
const keptUsd = keptRuns.reduce((t, g) => t + num(g.cost_usd), 0);
const keptCredits = keptRuns.reduce((t, g) => t + num(g.credits_charged), 0);
const ledgerCredits = ledger.reduce((t, r) => t + num(r.amount), 0);
const unpriced = runs.filter((g) => g.status === "succeeded" && g.cost_usd == null);
const stuck = runs.filter((g) => g.status !== "succeeded" && g.status !== "failed");

const byNode = rollup(runs, (g) => nodeLabel(nodeById.get(g.node_id)));
const byType = rollup(runs, (g) => g.type);
const byModel = rollup(runs, (g) => g.model_used);
const byDay = rollup(runs, (g) => g.created_at.slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key));

const nodeTypeCounts = {};
for (const n of nodes) nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;

// ------------------------------------------------------------------- output

const line = (label, value) => console.log(`  ${pad(label, 28)} ${value}`);

console.log(`\n${"═".repeat(80)}`);
console.log(`  COST PROBE — ${client.name} / ${canvas.name}   [${envName}]`);
console.log(`  /clients/${client.slug}/canvases/${canvas.slug}   canvas ${canvas.id}`);
console.log(`${"═".repeat(80)}\n`);

console.log("SUMMARY");
line("nodes", `${nodes.length}  (${Object.entries(nodeTypeCounts).map(([k, v]) => `${k}=${v}`).join("  ")})`);
line("generation runs", `${runs.length}  (${runs.filter((g) => g.status === "succeeded").length} ok, ${runs.filter((g) => g.status === "failed").length} failed, ${stuck.length} other)`);
line("TOTAL vendor cost (USD)", usd(totalUsd));
line("TOTAL credits charged", `${totalCredits}  (= ${usd(totalCredits / 1000)} at 1 credit = $0.001)`);
line("ledger net credits", `${ledgerCredits}${ledgerCredits === totalCredits ? "  ✓ matches" : "  ✗ MISMATCH vs credits_charged"}`);
line("kept outputs only (USD)", `${usd(keptUsd)}  across ${keptRuns.length} runs  (${keptCredits} credits)`);
line("re-roll / discarded (USD)", `${usd(totalUsd - keptUsd)}  (${totalUsd ? Math.round(((totalUsd - keptUsd) / totalUsd) * 100) : 0}% of spend)`);
line("first → last run", runs.length ? `${runs[0].created_at.slice(0, 16)} → ${runs.at(-1).created_at.slice(0, 16)}` : "—");

printRollup("BY TYPE", byType, 20);
printRollup("BY MODEL", byModel, 40);
printRollup("BY NODE", byNode, 48);
printRollup("BY DAY", byDay, 12);

if (unpriced.length) {
  console.log(`\nUNPRICED — ${unpriced.length} succeeded run(s) with cost_usd = null (model missing from a pricing table)\n`);
  for (const g of unpriced)
    console.log(`  ${g.created_at.slice(0, 16)}  ${pad(g.type, 7)} ${pad(g.model_used ?? "—", 36)} tokens=${JSON.stringify(g.tokens_used)}`);
}
if (stuck.length) {
  console.log(`\nNOT TERMINAL — ${stuck.length} run(s) still 'running' (cost not settled)\n`);
  for (const g of stuck) console.log(`  ${g.created_at.slice(0, 16)}  ${pad(g.type, 7)} ${g.model_used}`);
}

if (args.includes("--runs")) {
  console.log("\nALL RUNS\n");
  for (const g of runs) {
    const p = g.params_snapshot ?? {};
    const shape = [p.durationSeconds ?? p.duration, p.resolution, p.aspectRatio ?? p.aspect_ratio, p.quality]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${g.created_at.slice(0, 16)} ${pad(g.status, 9)} ${pad(g.type, 7)} ${pad(clip(g.model_used ?? "—", 34), 34)} ${padL(
        g.cost_usd == null ? "—" : usd(num(g.cost_usd)),
        10,
      )} ${padL(num(g.credits_charged), 6)} ${isKept(g) ? "KEPT" : "    "} ${shape}`,
    );
  }
}

console.log(
  "\n  Not captured: copilot / compose / parse / file-extract LLM calls (no generations row).\n",
);

const outPath = flag("out", null);
if (outPath) {
  const report = {
    generatedAt: new Date().toISOString(),
    environment: envName,
    client: { slug: client.slug, name: client.name, id: client.id },
    canvas,
    totals: { runs: runs.length, usd: totalUsd, credits: totalCredits, ledgerCredits, keptUsd, keptCredits },
    byType,
    byModel,
    byNode,
    byDay,
    unpriced,
    runs,
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON report written to ${outPath}\n`);
}
