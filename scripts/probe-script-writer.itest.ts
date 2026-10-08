// Spec 2 §11 — the writing-model probe. REAL model calls (costs a few cents per model).
//
//   npx vitest run --config vitest.integration.config.ts scripts/probe-script-writer.itest.ts
//
// Env: PROBE_MODELS=gpt-5.4-mini,gemini-3.8-flash (default: SCRIPT_WRITER_CANDIDATES),
//      PROBE_RUNS=3 (repeat each draft, for the parse round trip on repeated runs),
//      PROBE_OUTLINES=<path to the Jackfruit365 outline .md> (default: the main repo's copy).
//      PROBE_THINKING=low (ask Gemini to think less, for speed).
// Writes each printed draft and REPORT.md to <os tmpdir>/script-writer-probe; nothing in the repo.
import { describe, it, beforeAll } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const OUTLINES = process.env.PROBE_OUTLINES
  ?? path.resolve("../../../docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md");
const OUT = path.join(os.tmpdir(), "script-writer-probe");
const CLIENT_SLUG = "jackfruit-365";

/** §2 "House spec" of the outline document: what the KB's consistency notes hold for the demo. */
function houseSpec(md: string): string {
  const start = md.indexOf("**2\\. House spec");
  const end = md.indexOf("**Reel 01");
  if (start < 0 || end < 0) throw new Error(`No House spec section in ${OUTLINES}`);
  return md.slice(start, end).trim();
}

const REEL_04_CARD = {
  title: "Kerala Piravi at our table",
  reelNumber: 4,
  lines: [
    { label: "Format", value: "UGC", source: "given" as const },
    { label: "Post date", value: "Sun 1 Nov", source: "given" as const },
    { label: "Occasion or theme", value: "Kerala Piravi", source: "given" as const },
    { label: "Region", value: "South (Kerala)", source: "proposed" as const },
    { label: "Home and kit", value: "Saraswathi and Rajan's home in Thrissur: Kerala kit", source: "proposed" as const },
    { label: "Meal moment and product use", value: "Lunch: one level tablespoon stirred into each bowl of curd beside the rice. Two spoons, one each.", source: "proposed" as const },
    { label: "Review theme and placement", value: "Ease of using it in everyday meals; mid-reel, after STEP", source: "proposed" as const },
    { label: "Proof lines", value: "Claim card, usage line, diet line, origin line for a Kerala home", source: "proposed" as const },
    { label: "Disclaimers", value: "D1, D2, D4 (the study is not named)", source: "proposed" as const },
  ],
  cast: [
    { name: "Saraswathi", role: "The lead; reacts to the review", isLead: true, avatarId: null },
    { name: "Rajan", role: "Her husband; reads the pack; raises his tumbler at the payoff", isLead: false, avatarId: null },
  ],
  toConfirm: ["Sun 1 Nov is Kerala Piravi", "'Made in Kerala' matches actual production"],
};

const FOUNDER_CARD = {
  title: "World Diabetes Day, from James",
  reelNumber: 6,
  lines: [
    { label: "Format", value: "Founder-led", source: "given" as const },
    { label: "Post date", value: "Sat 14 Nov", source: "given" as const },
    { label: "Occasion or theme", value: "World Diabetes Day: what it is, how it's used, and where the claim comes from. No scare, no hype.", source: "given" as const },
    { label: "Region", value: "Pan-India", source: "proposed" as const },
    { label: "Home and kit", value: "The founder's kitchen-style set, as earlier reels", source: "proposed" as const },
    { label: "Proof lines", value: "Claim card; the study named", source: "proposed" as const },
    { label: "Disclaimers", value: "D1, D2, D3, D4 (the study is named)", source: "proposed" as const },
  ],
  cast: [{ name: "James", role: "The founder, to camera", isLead: true, avatarId: null }],
  toConfirm: ["14 Nov is also Children's Day: keep the reel away from children"],
};

const RUNS = [
  { key: "reel-04", card: REEL_04_CARD, founderLed: false, shots: [12, 15] as [number, number], editBeat: "PAYOFF", edit: "Make the PAYOFF warmer." },
  { key: "founder-wdd", card: FOUNDER_CARD, founderLed: true, shots: [9, 15] as [number, number], editBeat: "HOOK", edit: "Make the HOOK punchier." },
];

describe("script writer probe", () => {
  it("writes, edits and re-parses Reel 04 and a Founder-led reel with each candidate model", async () => {
    const { SCRIPT_WRITER_CANDIDATES } = await import("@/lib/scripts/copilot/constants");
    const { getClientBySlug } = await import("@/lib/db/clients");
    const { getActiveKBVersion } = await import("@/lib/db/kb");
    const { listScripts } = await import("@/lib/db/scripts");
    const { listCopilotAvatars } = await import("@/lib/db/script-generate");
    const { renderKbText, renderLibrary, renderAvatars } = await import("@/lib/scripts/copilot/prompt-context");
    const { draftPrompt, editPrompt } = await import("@/lib/scripts/copilot/messages");
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { draftOutputSchema, editTurnSchema } = await import("@/lib/scripts/copilot/output");
    const { toScriptDoc, newShotId } = await import("@/lib/scripts/copilot/draft");
    const { applyOps } = await import("@/lib/scripts/copilot/ops");
    const { fillToFinal } = await import("@/lib/scripts/copilot/fill-to-final");
    const { scoreDraft, scoreEditIsolation } = await import("@/lib/scripts/copilot/probe-score");
    const { EMPTY_BRIEF, EMPTY_NOTES } = await import("@/lib/scripts/copilot/schema");
    const { printScript } = await import("@/lib/scripts/print");
    const { compileScript } = await import("@/lib/nodes/script");
    const { scriptParsePrompt } = await import("@/prompts/script-parse");
    const { createOpenAI } = await import("@/lib/openai/server");

    const client = await getClientBySlug(CLIENT_SLUG);
    if (!client) throw new Error(`No client ${CLIENT_SLUG}`);
    const version = await getActiveKBVersion(client.id);
    type KbBits = {
      image_analysis?: Record<string, unknown>;
      compliance?: { never_use_words?: { value: string[] | null }; never_use_claims?: { value: string[] | null } };
    };
    const kb = version ? (version.output as unknown as KbBits) : null;
    const house = houseSpec(readFileSync(OUTLINES, "utf8"));
    // The demo's KB holds the house spec in its consistency notes (answer 2c.1); put it there for the probe.
    const kbWithHouse = {
      ...(kb ?? {}),
      image_analysis: { ...(kb?.image_analysis ?? {}), brand_consistency_notes: { value: house, confidence: "high", evidence_type: "explicit", status: "approved" } },
    };
    const kbText = renderKbText(kbWithHouse as never);
    const neverList = [...(kb?.compliance?.never_use_words?.value ?? []), ...(kb?.compliance?.never_use_claims?.value ?? [])];
    const library = await listScripts(client.id);
    const avatars = await listCopilotAvatars(client.id);
    const models = process.env.PROBE_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? [...SCRIPT_WRITER_CANDIDATES];
    const repeats = Number(process.env.PROBE_RUNS ?? 1);
    mkdirSync(OUT, { recursive: true });

    const report: string[] = ["# Script writer probe", "", `Outlines: ${OUTLINES}`, `Models: ${models.join(", ")}`, ""];
    for (const model of models) {
      const call = structuredCaller(model, process.env.PROBE_THINKING === "low" ? { thinking: "low" } : {});
      for (const run of RUNS) {
        for (let n = 1; n <= repeats; n++) {
          // The Founder-led run is written with no Founder-led example (spec 2 §4.3).
          const examples = run.founderLed ? library.filter((s) => !/founder/i.test(s.doc.header.format)) : library;
          const base = { clientName: client.name, kbText, library: renderLibrary(examples, run.founderLed ? "Founder-led" : "UGC"), avatars: renderAvatars(avatars) };
          const brief = { ...EMPTY_BRIEF, phase: "confirm" as const, reelNumber: run.card.reelNumber, card: run.card };
          const label = `${model} · ${run.key} · run ${n}`;
          try {
            const t0 = Date.now();
            const draft = await call({ name: "script_draft", ...draftPrompt(base, { brief, card: run.card }), schema: draftOutputSchema });
            const draftMs = Date.now() - t0;
            const doc = toScriptDoc(draft, { reelNumber: run.card.reelNumber, avatarIds: new Set(avatars.map((a) => a.id)) });
            const checks = scoreDraft(doc, {
              founderLed: run.founderLed,
              lockedLines: run.founderLed ? ["Helps control blood sugar levels*"] : ["Helps control blood sugar levels*", "Just 1 tablespoon per meal", "No change to your diet", "Available on Amazon"],
              neverList,
              shots: run.shots,
              seconds: [45, 55],
            });

            const t1 = Date.now();
            const edit = await call({ name: "script_edit", ...editPrompt(base, { doc, notes: EMPTY_NOTES, openItems: fillToFinal(doc, EMPTY_NOTES), lastAssistant: "", text: run.edit }), schema: editTurnSchema });
            const editMs = Date.now() - t1;
            const applied = applyOps(doc, EMPTY_NOTES, edit.ops, { newShotId, avatarIds: new Set() });
            checks.push(applied.ok ? scoreEditIsolation(doc, applied.doc, run.editBeat) : { name: "edit isolation", pass: false, detail: applied.error });

            // Spec 2 §15 item 8: the printed script parses with no manual fixing, one parsed shot per shot.
            const printed = printScript(doc);
            const { system, user } = compileScript(printed, "", "", "tint");
            const completion = await createOpenAI().chat.completions.create({
              model: scriptParsePrompt.model,
              response_format: { type: "json_schema", json_schema: { name: "reel_script", schema: scriptParsePrompt.schema, strict: true } },
              messages: [{ role: "system", content: system }, { role: "user", content: user }],
            });
            const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
            const parsedShots: number = parsed?.visual_script?.shots?.length ?? 0;
            checks.push({ name: "parse round trip", pass: parsedShots === doc.shots.length, detail: `${parsedShots} parsed for ${doc.shots.length} written` });

            const passed = checks.filter((c) => c.pass).length;
            writeFileSync(path.join(OUT, `${model}-${run.key}-${n}.md`), [`# ${label}`, "", printed, "", "## Checks", ...checks.map((c) => `- ${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`), "", `Edit asked: ${run.edit}`, `Edit reply: ${edit.reply}`].join("\n"));
            report.push(`## ${label}`, `${passed}/${checks.length} checks · draft ${(draftMs / 1000).toFixed(1)}s · edit ${(editMs / 1000).toFixed(1)}s`, ...checks.filter((c) => !c.pass).map((c) => `- FAIL ${c.name}: ${c.detail}`), "");
          } catch (e) {
            report.push(`## ${label}`, `ERROR: ${e instanceof Error ? e.message : String(e)}`, "");
          }
        }
      }
    }
    writeFileSync(path.join(OUT, "REPORT.md"), report.join("\n"));
    console.log(`\nProbe written to ${OUT}\n\n${report.join("\n")}`);
  }, 1_800_000);
});
