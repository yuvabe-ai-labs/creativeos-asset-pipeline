// TEMPORARY eval-bootstrap route (Step 2 of the eval flywheel). Generates ~20
// image-prompt traces from the real Prakriti Sattva reel scripts, faithfully:
// real Script-parse → narrow to one shot (D21) → real compilePrompt → real
// prompt-generate → insertVersion (generated_output captured by Step 1).
// All traces hang off ONE dedicated eval Prompt node so Step 3 can read them via
// listVersions(evalNodeId). DELETE THIS ROUTE after the traces are generated.
//
// Trigger:
//   dry-run (just print the 20 selected): curl -X POST 'localhost:3000/api/_eval/bootstrap?dry=1'
//   real run:                             curl -X POST 'localhost:3000/api/_eval/bootstrap'
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServerSupabase } from "@/lib/supabase/server";
import { createOpenAI } from "@/lib/openai/server";
import { getActiveKBVersion } from "@/lib/db/kb";
import {
  buildParseContext,
  DEFAULT_IMAGE_PROMPT_SLICES,
  DEFAULT_PARSE_SLICES,
} from "@/lib/kb/parse-context";
import { compileScript } from "@/lib/nodes/script";
import { compilePrompt, DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";
import { renderShotForImage } from "@/lib/nodes/node-output";
import { scriptParsePrompt } from "@/prompts/script-parse";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { ReelScript } from "@/lib/nodes/reel-script";

const CLIENT_SLUG = "prakriti-satva";
const SCRIPTS_FILE = "docs/context-refs/Prakriti - satva/Prakriti Sattva Reel 52 Scripts.md";
const TARGET = 20;

type RawScript = { num: number; title: string; type: string; body: string };

// Split the 52-script .md into individual scripts on the `## **\#N Title [TYPE]**` headers.
function splitScripts(md: string): RawScript[] {
  const headerRe = /^##\s+\*\*\\?#(\d+)\s+(.+?)\s*\\?\[(VISUAL|VO|TEXT)\\?\]\*\*\s*$/gm;
  const heads: { num: number; title: string; type: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(md))) {
    heads.push({ num: +m[1], title: m[2].trim(), type: m[3], start: m.index, end: -1 });
  }
  const raw = heads.map((h, i) => ({
    num: h.num,
    title: h.title,
    type: h.type,
    body: md.slice(h.start, i + 1 < heads.length ? heads[i + 1].start : md.length).trim(),
  }));
  // The .md contains TWO copies of the script set (e.g. #1 appears at line 42 AND 3394).
  // Dedup by script number, keeping the fuller (longer-body) copy.
  const byNum = new Map<number, RawScript>();
  for (const s of raw) {
    const prev = byNum.get(s.num);
    if (!prev || s.body.length > prev.body.length) byNum.set(s.num, s);
  }
  return [...byNum.values()].sort((a, b) => a.num - b.num);
}

// Evenly stride to pick TARGET scripts across all 52 (spreads type + theme coverage).
function selectScripts(all: RawScript[], n: number): RawScript[] {
  if (all.length <= n) return all;
  const step = all.length / n;
  return Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]);
}

function narrowToShot(reel: ReelScript, shotIndex: number): ReelScript {
  const shots = reel.visual_script?.shots ?? [];
  return { ...reel, visual_script: { ...reel.visual_script, shots: [shots[shotIndex]] } };
}

export async function POST(req: Request) {
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const md = readFileSync(join(process.cwd(), SCRIPTS_FILE), "utf8");
  const all = splitScripts(md);
  if (all.length === 0) return apiError("No scripts parsed from the .md.", 500);

  const selected = selectScripts(all, TARGET);
  const typeCounts = selected.reduce<Record<string, number>>((a, s) => {
    a[s.type] = (a[s.type] ?? 0) + 1;
    return a;
  }, {});

  if (dry) {
    return apiOk({
      dryRun: true,
      totalScripts: all.length,
      selectedCount: selected.length,
      typeCounts,
      selection: selected.map((s, i) => ({
        order: i + 1,
        scriptNum: s.num,
        type: s.type,
        title: s.title,
        // the shot index we'll narrow to (varied across selections for shot-position coverage)
        shotIndexPlanned: i % 5,
      })),
    });
  }

  const supabase = createServerSupabase();

  // 1. Resolve client + active KB
  const { data: client } = await supabase
    .from("clients")
    .select("id, active_kb_version_id")
    .eq("slug", CLIENT_SLUG)
    .maybeSingle();
  if (!client) return apiError(`Client '${CLIENT_SLUG}' not found.`, 404);
  const clientId = (client as { id: string }).id;

  const kbVersion = await getActiveKBVersion(clientId);
  if (!kbVersion) return apiError("Client has no active KB version.", 400);
  const kb = kbVersion.output as unknown as TraceableBrandKB;
  const parseContext = buildParseContext(kb, DEFAULT_PARSE_SLICES);
  const genContext = buildParseContext(kb, DEFAULT_IMAGE_PROMPT_SLICES);

  // 2. Ensure a dedicated eval canvas + one eval Prompt node (idempotent by slug)
  let { data: canvas } = await supabase
    .from("canvases")
    .select("id")
    .eq("client_id", clientId)
    .eq("slug", "eval-harness")
    .maybeSingle();
  if (!canvas) {
    const ins = await supabase
      .from("canvases")
      .insert({ client_id: clientId, name: "Eval Harness", slug: "eval-harness", viewport: { x: 0, y: 0, zoom: 1 } })
      .select("id")
      .single();
    if (ins.error) return apiError(`Canvas create failed: ${ins.error.message}`, 500);
    canvas = ins.data;
  }
  const canvasId = (canvas as { id: string }).id;

  // 2b. CLEAN legacy data: the old model put 20 versions on ONE node. Delete any prompt
  // node on this canvas that has no `evalKey` — that removes the legacy node and cascades
  // its versions. New model (below): ONE node per shot, keyed by evalKey.
  const { data: existingNodes } = await supabase
    .from("nodes")
    .select("id, data")
    .eq("canvas_id", canvasId)
    .eq("type", "prompt");
  const legacyIds = (existingNodes ?? [])
    .filter((n) => !((n.data as Record<string, unknown>)?.evalKey))
    .map((n) => (n as { id: string }).id);
  if (legacyIds.length > 0) await supabase.from("nodes").delete().in("id", legacyIds);

  // 3. Per selected shot: faithful parse → narrow → compile → generate, onto ITS OWN node.
  // A node = one input/task (D4); re-running a fixed prompt appends a version per node.
  const openai = createOpenAI();
  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < selected.length; i++) {
    const s = selected[i];
    try {
      // 3a. faithful Script-parse (same prompt/schema/model as the real route)
      const { system: pSys, user: pUser } = compileScript(s.body, parseContext);
      const parseCompletion = await openai.chat.completions.create({
        model: scriptParsePrompt.model,
        response_format: {
          type: "json_schema",
          json_schema: { name: "reel_script", schema: scriptParsePrompt.schema, strict: true },
        },
        messages: [
          { role: "system", content: pSys },
          { role: "user", content: pUser },
        ],
      });
      const reel = JSON.parse(parseCompletion.choices[0]?.message?.content ?? "{}") as ReelScript;
      const shotCount = reel.visual_script?.shots?.length ?? 0;
      if (shotCount === 0) {
        results.push({ scriptNum: s.num, type: s.type, skipped: "no shots parsed" });
        continue;
      }
      const shotIndex = i % shotCount; // vary shot position for coverage
      const narrowed = narrowToShot(reel, shotIndex);
      const shotText = renderShotForImage(narrowed); // faithful to production: getNodeOutput "shot" → renderShotForImage (D23)

      // 3b. faithful image-prompt generation (real compilePrompt + prompt-generate)
      const { system: gSys, user: gUser } = compilePrompt({
        clientContext: genContext,
        upstream: [{ label: "Shot", type: "shot", text: shotText }],
        instruction: DEFAULT_INSTRUCTION,
      });
      const genCompletion = await openai.chat.completions.create({
        model: promptGeneratePrompt.model,
        messages: [
          { role: "system", content: gSys },
          { role: "user", content: gUser },
        ],
      });
      const output = genCompletion.choices[0]?.message?.content?.trim() ?? "";

      // 3c. find-or-create THIS shot's own Prompt node (idempotent by evalKey, so a
      // re-run with a fixed prompt appends v2 to the same node = per-shot before/after).
      const evalKey = `s${s.num}-shot${shotIndex}`;
      let { data: shotNode } = await supabase
        .from("nodes")
        .select("id")
        .eq("canvas_id", canvasId)
        .eq("data->>evalKey", evalKey)
        .maybeSingle();
      if (!shotNode) {
        const insN = await supabase
          .from("nodes")
          .insert({
            canvas_id: canvasId,
            type: "prompt",
            position: { x: (i % 5) * 260, y: Math.floor(i / 5) * 200 },
            data: { title: `#${s.num} ${s.title} · shot ${shotIndex}`, evalKey, scriptNum: s.num, reelType: s.type },
          })
          .select("id")
          .single();
        if (insN.error) throw new Error(`node create: ${insN.error.message}`);
        shotNode = insN.data;
      }
      const shotNodeId = (shotNode as { id: string }).id;

      const version = await insertVersion({
        nodeId: shotNodeId,
        inputsUsed: {
          eval: true,
          scriptNum: s.num,
          scriptTitle: s.title,
          reelType: s.type,
          shotIndex,
          kbVersionId: kbVersion.id,
          shotText,            // the rendered source shot fed in (the viewer's "context in")
          compiledUser: gUser, // the exact user message sent (request-inspector data)
        },
        paramsUsed: {
          instruction: DEFAULT_INSTRUCTION,
          promptId: promptGeneratePrompt.id,
          promptVersion: promptGeneratePrompt.version,
          tokensUsed: genCompletion.usage ?? null,
        },
        modelUsed: `openai:${promptGeneratePrompt.model}`,
        output,
      });
      await setActiveVersion(shotNodeId, version.id);
      results.push({ scriptNum: s.num, type: s.type, title: s.title, shotIndex, nodeId: shotNodeId, versionId: version.id, ok: true });
    } catch (e) {
      results.push({ scriptNum: s.num, type: s.type, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return apiOk({
    canvasId,
    nodeModel: "one-node-per-shot",
    generated: ok,
    failed: results.length - ok,
    typeCounts,
    results,
  });
}
