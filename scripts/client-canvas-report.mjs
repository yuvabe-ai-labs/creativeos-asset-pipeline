// Read-only report: for one client, summarise every canvas — node mix (with an
// emphasis on image-gen / video-gen), generation activity, credits and models.
//
//   node scripts/client-canvas-report.mjs <client-slug> [options]
//
// Options:
//   --env=<name>   which .env.<name> file to read      (default: production)
//   --json         also print the raw JSON report
//   --out=<path>   write the JSON report to a file
//
// Examples:
//   node scripts/client-canvas-report.mjs prakriti-sattva-final
//   node scripts/client-canvas-report.mjs prakriti-sattva-final --env=staging
//   node scripts/client-canvas-report.mjs prakriti-sattva-final --out=research-output/psf.json
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- args + env

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (!slug) {
  console.error(
    "Usage: node scripts/client-canvas-report.mjs <client-slug> [--env=production] [--json] [--out=path]",
  );
  process.exit(1);
}

const envName = flag("env", "production");
const envPath = new URL(`../.env.${envName}`, import.meta.url);

let envText;
try {
  envText = readFileSync(envPath, "utf8");
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
  console.error(
    `.env.${envName} is missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`,
  );
  process.exit(1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ------------------------------------------------------------------ helpers

const die = (label, error) => {
  console.error(`${label}: ${error.message}`);
  process.exit(1);
};

/** Supabase caps `.in()` list length in practice — page through ids in chunks. */
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

const tally = (rows, key) => {
  const counts = {};
  for (const row of rows) {
    const k = typeof key === "function" ? key(row) : row[key];
    if (k == null) continue;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
};

const day = (iso) => (iso ? iso.slice(0, 10) : "—");
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const round2 = (n) => Math.round(n * 100) / 100;

// --------------------------------------------------------------- data fetch

const { data: client, error: clientErr } = await supabase
  .from("clients")
  .select("*")
  .eq("slug", slug)
  .maybeSingle();
if (clientErr) die("client query failed", clientErr);
if (!client) {
  console.error(`No client with slug "${slug}" in ${envName}.`);
  const { data: all } = await supabase
    .from("clients")
    .select("slug, name")
    .order("slug");
  if (all?.length) {
    console.error("\nAvailable clients:");
    for (const c of all) console.error(`  ${c.slug}  —  ${c.name}`);
  }
  process.exit(1);
}

const { data: canvases, error: canvasErr } = await supabase
  .from("canvases")
  .select("id, slug, name, created_at, updated_at")
  .eq("client_id", client.id)
  .order("created_at");
if (canvasErr) die("canvases query failed", canvasErr);

const canvasIds = (canvases ?? []).map((c) => c.id);
const nodes = canvasIds.length
  ? await selectIn(
      "nodes",
      "id, canvas_id, type, active_version_id, created_at, updated_at",
      "canvas_id",
      canvasIds,
    )
  : [];

const nodeIds = nodes.map((n) => n.id);
const generations = nodeIds.length
  ? await selectIn(
      "generations",
      // 0019 renamed credits_consumed -> cost_usd (it always held raw USD) and
      // added credits_charged as the real billing figure.
      "id, node_id, type, status, model_used, cost_usd, credits_charged, created_at",
      "node_id",
      nodeIds,
    )
  : [];

const versions = nodeIds.length
  ? await selectIn(
      "node_versions",
      "id, node_id, decision, approval_status",
      "node_id",
      nodeIds,
    )
  : [];

// ---------------------------------------------------------------- roll-up

const canvasOfNode = new Map(nodes.map((n) => [n.id, n.canvas_id]));
const nodesByCanvas = new Map(canvasIds.map((id) => [id, []]));
for (const n of nodes) nodesByCanvas.get(n.canvas_id)?.push(n);

const gensByCanvas = new Map(canvasIds.map((id) => [id, []]));
for (const g of generations) {
  const cid = canvasOfNode.get(g.node_id);
  if (cid) gensByCanvas.get(cid)?.push(g);
}

const versionsByCanvas = new Map(canvasIds.map((id) => [id, []]));
for (const v of versions) {
  const cid = canvasOfNode.get(v.node_id);
  if (cid) versionsByCanvas.get(cid)?.push(v);
}

const summarise = (canvas) => {
  const cNodes = nodesByCanvas.get(canvas.id) ?? [];
  const cGens = gensByCanvas.get(canvas.id) ?? [];
  const cVersions = versionsByCanvas.get(canvas.id) ?? [];

  const byType = tally(cNodes, "type");
  const imageGen = byType["image-gen"] ?? 0;
  const videoGen = byType["video-gen"] ?? 0;

  const genNodes = cNodes.filter(
    (n) => n.type === "image-gen" || n.type === "video-gen",
  );
  const withOutput = genNodes.filter((n) => n.active_version_id).length;

  const credits = cGens.reduce((sum, g) => sum + Number(g.credits_charged ?? 0), 0);
  const costUsd = cGens.reduce((sum, g) => sum + Number(g.cost_usd ?? 0), 0);
  const lastActivity = [
    canvas.updated_at,
    ...cNodes.map((n) => n.updated_at),
    ...cGens.map((g) => g.created_at),
  ]
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    slug: canvas.slug,
    name: canvas.name,
    createdAt: canvas.created_at,
    lastActivity,
    nodes: {
      total: cNodes.length,
      imageGen,
      videoGen,
      genTotal: imageGen + videoGen,
      genWithOutput: withOutput,
      byType,
    },
    generations: {
      total: cGens.length,
      byType: tally(cGens, "type"),
      byStatus: tally(cGens, "status"),
      byModel: tally(cGens, "model_used"),
      creditsCharged: round2(credits),
      costUsd: Math.round(costUsd * 10000) / 10000,
    },
    versions: {
      total: cVersions.length,
      byDecision: tally(
        cVersions,
        (v) => v.approval_status ?? v.decision ?? "undecided",
      ),
    },
  };
};

const perCanvas = (canvases ?? []).map(summarise);
const byGenNodes = [...perCanvas].sort(
  (a, b) =>
    b.nodes.genTotal - a.nodes.genTotal || b.nodes.total - a.nodes.total,
);

const sum = (pick) => perCanvas.reduce((t, c) => t + pick(c), 0);
const merge = (pick) => {
  const out = {};
  for (const c of perCanvas)
    for (const [k, v] of Object.entries(pick(c))) out[k] = (out[k] ?? 0) + v;
  return out;
};

const report = {
  generatedAt: new Date().toISOString(),
  environment: envName,
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  client: {
    slug: client.slug,
    name: client.name,
    id: client.id,
    orgId: client.org_id ?? null,
    websiteUrl: client.website_url ?? null,
    kbStatus: client.kb_status ?? null,
    driveRootFolderId: client.drive_root_folder_id ?? null,
    archivedAt: client.archived_at ?? null,
    createdAt: client.created_at,
    updatedAt: client.updated_at,
  },
  totals: {
    canvases: perCanvas.length,
    nodes: sum((c) => c.nodes.total),
    imageGenNodes: sum((c) => c.nodes.imageGen),
    videoGenNodes: sum((c) => c.nodes.videoGen),
    genNodesWithOutput: sum((c) => c.nodes.genWithOutput),
    nodesByType: merge((c) => c.nodes.byType),
    generations: sum((c) => c.generations.total),
    generationsByType: merge((c) => c.generations.byType),
    generationsByStatus: merge((c) => c.generations.byStatus),
    generationsByModel: merge((c) => c.generations.byModel),
    creditsCharged: round2(sum((c) => c.generations.creditsCharged)),
    costUsd: Math.round(sum((c) => c.generations.costUsd) * 10000) / 10000,
    nodeVersions: sum((c) => c.versions.total),
    versionsByDecision: merge((c) => c.versions.byDecision),
  },
  canvases: perCanvas,
  ranking: byGenNodes.map((c) => ({
    slug: c.slug,
    name: c.name,
    imageGen: c.nodes.imageGen,
    videoGen: c.nodes.videoGen,
    genTotal: c.nodes.genTotal,
  })),
};

// ------------------------------------------------------------------- output

const t = report.totals;
const line = (label, value) => console.log(`  ${pad(label, 24)} ${value}`);
const entries = (obj) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join("  ") || "—";

console.log(`\n${"═".repeat(78)}`);
console.log(`  ${report.client.name}  (${report.client.slug})   [${envName}]`);
console.log(`${"═".repeat(78)}\n`);

console.log("CLIENT");
line("id", report.client.id);
line("org_id", report.client.orgId ?? "—");
line("website", report.client.websiteUrl ?? "—");
line("kb_status", report.client.kbStatus ?? "—");
line("drive folder", report.client.driveRootFolderId ?? "—");
line("archived", report.client.archivedAt ?? "no");
line("created", day(report.client.createdAt));

console.log("\nTOTALS");
line("canvases", t.canvases);
line("nodes", t.nodes);
line("image-gen nodes", t.imageGenNodes);
line("video-gen nodes", t.videoGenNodes);
line("gen nodes w/ output", `${t.genNodesWithOutput} / ${t.imageGenNodes + t.videoGenNodes}`);
line("node_versions", t.nodeVersions);
line("generations", t.generations);
line("credits charged", t.creditsCharged);
line("raw cost (USD)", t.costUsd);
line("nodes by type", entries(t.nodesByType));
line("gens by type", entries(t.generationsByType));
line("gens by status", entries(t.generationsByStatus));
line("gens by model", entries(t.generationsByModel));
line("versions by decision", entries(t.versionsByDecision));

console.log("\nCANVASES — ranked by image-gen + video-gen node count\n");
const W = { name: 30, num: 6 };
console.log(
  `  ${pad("CANVAS", W.name)} ${padL("IMG", W.num)} ${padL("VID", W.num)} ${padL(
    "GEN",
    W.num,
  )} ${padL("NODES", W.num)} ${padL("RUNS", W.num)} ${padL("USD", 8)} ${padL("CREDITS", 8)}  LAST ACTIVITY`,
);
// credits_charged only exists from migration 0019 onward, so pre-ledger runs
// show 0 credits while still carrying a real cost_usd — read USD for history.
console.log(`  ${"─".repeat(85)}`);
for (const c of byGenNodes) {
  const label = c.name.length > W.name - 1 ? `${c.name.slice(0, W.name - 2)}…` : c.name;
  console.log(
    `  ${pad(label, W.name)} ${padL(c.nodes.imageGen, W.num)} ${padL(
      c.nodes.videoGen,
      W.num,
    )} ${padL(c.nodes.genTotal, W.num)} ${padL(c.nodes.total, W.num)} ${padL(
      c.generations.total,
      W.num,
    )} ${padL(c.generations.costUsd, 8)} ${padL(c.generations.creditsCharged, 8)}  ${day(
      c.lastActivity,
    )}`,
  );
}

console.log("\nPER-CANVAS DETAIL\n");
for (const c of byGenNodes) {
  console.log(`  ▸ ${c.name}  (/${c.slug})`);
  line("    node mix", entries(c.nodes.byType));
  line("    generations", `${c.generations.total} — ${entries(c.generations.byStatus)}`);
  line("    models", entries(c.generations.byModel));
  line("    cost", `$${c.generations.costUsd}  (${c.generations.creditsCharged} credits)`);
  line("    versions", `${c.versions.total} — ${entries(c.versions.byDecision)}`);
  line("    created / last", `${day(c.createdAt)} → ${day(c.lastActivity)}`);
  console.log("");
}

const outPath = flag("out", null);
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON report written to ${outPath}\n`);
}
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));

// A markdown rendering of the same report, for pasting into docs/tickets.
const mdPath = flag("md", null);
if (mdPath) {
  const rows = byGenNodes.map((c) =>
    `| ${c.name} | \`${c.slug}\` | ${c.nodes.imageGen} | ${c.nodes.videoGen} | ` +
    `${c.nodes.genTotal} | ${c.nodes.total} | ${c.generations.total} | ` +
    `${c.generations.costUsd} | ${day(c.lastActivity)} |`,
  );
  const kv = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `\`${k}\` ${v}`)
      .join(" · ") || "—";

  const md = [
    `# ${report.client.name} — canvas summary`,
    "",
    `_Environment_ **${envName}** · _generated_ ${report.generatedAt.slice(0, 10)} · ` +
      `_client_ \`${report.client.slug}\` (\`${report.client.id}\`)`,
    "",
    "## Totals",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Canvases | ${t.canvases} |`,
    `| Nodes | ${t.nodes} |`,
    `| **image-gen nodes** | **${t.imageGenNodes}** |`,
    `| **video-gen nodes** | **${t.videoGenNodes}** |`,
    `| Gen nodes with an output | ${t.genNodesWithOutput} / ${t.imageGenNodes + t.videoGenNodes} |`,
    `| Generation runs | ${t.generations} |`,
    `| Raw model cost | $${t.costUsd} |`,
    `| Credits charged | ${t.creditsCharged} |`,
    `| node_versions | ${t.nodeVersions} |`,
    "",
    `**Nodes by type** — ${kv(t.nodesByType)}`,
    "",
    `**Runs by type** — ${kv(t.generationsByType)}`,
    "",
    `**Runs by status** — ${kv(t.generationsByStatus)}`,
    "",
    `**Runs by model** — ${kv(t.generationsByModel)}`,
    "",
    `**Versions by approval state** — ${kv(t.versionsByDecision)}`,
    "",
    "## Canvases, ranked by image-gen + video-gen nodes",
    "",
    "| Canvas | Slug | Image gen | Video gen | Gen total | Nodes | Runs | Cost USD | Last activity |",
    "|---|---|--:|--:|--:|--:|--:|--:|---|",
    ...rows,
    "",
    "## Per-canvas detail",
    "",
    ...byGenNodes.flatMap((c) => [
      `### ${c.name} \`${c.slug}\``,
      "",
      `- **Node mix** — ${kv(c.nodes.byType)}`,
      `- **Runs** — ${c.generations.total} (${kv(c.generations.byStatus)})`,
      `- **Models** — ${kv(c.generations.byModel)}`,
      `- **Cost** — $${c.generations.costUsd} · ${c.generations.creditsCharged} credits`,
      `- **Versions** — ${c.versions.total} (${kv(c.versions.byDecision)})`,
      `- **Created → last activity** — ${day(c.createdAt)} → ${day(c.lastActivity)}`,
      "",
    ]),
  ].join("\n");

  writeFileSync(mdPath, `${md}\n`);
  console.log(`Markdown report written to ${mdPath}\n`);
}
