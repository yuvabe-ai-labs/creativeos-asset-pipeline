// Spec 2 §11 — the writing-model probe, client-agnostic (brand-neutral spec §2.6). REAL model calls
// (costs a few cents per model).
//
//   PROBE_CLIENT=<client slug> npx vitest run --config vitest.integration.config.ts scripts/probe-script-writer.itest.ts
//
// Env: PROBE_CLIENT (required) — the client whose saved KB, Content Rules, scripts, avatars and
//      market signals the copilot writes from, exactly as the app does.
//      PROBE_MODELS=gpt-5.4-mini,gemini-3.8-flash (default: SCRIPT_WRITER_CANDIDATES),
//      PROBE_RUNS=3 (repeat each draft), PROBE_OCCASION (default: the copilot proposes one),
//      PROBE_THINKING=low (ask Gemini to think less, for speed).
// For each format on the shared menu: angles and the card on the quick model (as the app does), then
// the draft and an edit on each model, scored against the card's beats and the client's own words.
// Writes each printed draft and REPORT-<client>.md to <os tmpdir>/script-writer-probe; nothing in the repo.
import { describe, it, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const OUT = path.join(os.tmpdir(), "script-writer-probe");

describe("script writer probe", () => {
  it("writes, edits and re-parses one reel per menu format for the client, with each candidate model", async () => {
    const slug = process.env.PROBE_CLIENT;
    if (!slug) throw new Error("Set PROBE_CLIENT to a client slug.");
    const { SCRIPT_WRITER_CANDIDATES, SCRIPT_QUICK_MODEL } = await import("@/lib/scripts/copilot/constants");
    const { SCRIPT_FORMATS, renderFormatMenu } = await import("@/lib/scripts/copilot/formats");
    const { getClientBySlug } = await import("@/lib/db/clients");
    const { getActiveKBVersion } = await import("@/lib/db/kb");
    const { loadCopilotContext } = await import("@/lib/scripts/copilot/context");
    const { renderLibrary, renderAvatars, nextReelNumber } = await import("@/lib/scripts/copilot/prompt-context");
    const { anglesPrompt, cardPrompt, draftPrompt, editPrompt } = await import("@/lib/scripts/copilot/messages");
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { anglesOutputSchema, cardOutputSchema, draftOutputSchema, editTurnSchema } = await import("@/lib/scripts/copilot/output");
    const { applyAngle, normalizeAngles, normalizeCard } = await import("@/lib/scripts/copilot/brief");
    const { toScriptDoc, newShotId } = await import("@/lib/scripts/copilot/draft");
    const { applyOps } = await import("@/lib/scripts/copilot/ops");
    const { fillToFinal } = await import("@/lib/scripts/copilot/fill-to-final");
    const { scoreDraft, scoreEditIsolation } = await import("@/lib/scripts/copilot/probe-score");
    const { EMPTY_BRIEF, EMPTY_NOTES } = await import("@/lib/scripts/copilot/schema");
    const { printScript } = await import("@/lib/scripts/print");
    const { compileScript } = await import("@/lib/nodes/script");
    const { scriptParsePrompt } = await import("@/prompts/script-parse");
    const { createOpenAI } = await import("@/lib/openai/server");

    const client = await getClientBySlug(slug);
    if (!client) throw new Error(`No client ${slug}`);
    const ctx = await loadCopilotContext(client, { signals: true });
    const version = await getActiveKBVersion(client.id);
    type KbBits = { compliance?: { never_use_words?: { value: string[] | null }; never_use_claims?: { value: string[] | null } } };
    const kb = version ? (version.output as unknown as KbBits) : null;
    const neverList = [...(kb?.compliance?.never_use_words?.value ?? []), ...(kb?.compliance?.never_use_claims?.value ?? [])];
    // The client's own words are not a leak: its KB text and its scripts.
    const clientText = [ctx.kbText, ...ctx.library.map((s) => printScript(s.doc))].join("\n");
    const avatarIds = new Set(ctx.avatars.map((a) => a.id));
    const quick = structuredCaller(SCRIPT_QUICK_MODEL);
    const models = process.env.PROBE_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? [...SCRIPT_WRITER_CANDIDATES];
    const repeats = Number(process.env.PROBE_RUNS ?? 1);
    const given = (value: string) => ({ value, status: "given" as const });
    mkdirSync(OUT, { recursive: true });

    const report: string[] = [
      "# Script writer probe", "", `Client: ${client.name} (${slug})`,
      `KB: ${ctx.hasKb ? "yes" : "none"} · scripts: ${ctx.library.length} · signals: ${ctx.signals.list.length}`, `Models: ${models.join(", ")}`, "",
    ];
    for (const format of SCRIPT_FORMATS) {
      const base = {
        clientName: client.name, kbText: ctx.kbText, library: renderLibrary(ctx.library, format.name), avatars: renderAvatars(ctx.avatars),
        today: ctx.today, signalDigest: ctx.signals.digest, formatMenu: renderFormatMenu(format.name),
      };
      // The brief as the app builds it: the format given, the rest left to the copilot.
      const occasion = process.env.PROBE_OCCASION ? given(process.env.PROBE_OCCASION) : { value: "", status: "skipped" as const };
      let brief: typeof EMPTY_BRIEF = { ...EMPTY_BRIEF, format: given(format.name), occasion };
      const proposed = await quick({ name: "script_angles", ...anglesPrompt(base, { brief, signalBrief: ctx.signals.brief, text: "Take it from here." }), schema: anglesOutputSchema });
      const angles = normalizeAngles(proposed.angles, ctx.signals.list, avatarIds);
      brief = applyAngle({ ...brief, angles }, angles[0], "given");
      const nextReel = nextReelNumber(ctx.library);
      const rawCard = await quick({ name: "script_card", ...cardPrompt(base, { brief, angle: angles[0], cardChange: "", nextReel }), schema: cardOutputSchema });
      const card = normalizeCard(rawCard, { reelNumber: nextReel, avatarIds });
      const confirmed = { ...brief, card, phase: "confirm" as const };

      for (const model of models) {
        const call = structuredCaller(model, process.env.PROBE_THINKING === "low" ? { thinking: "low" } : {});
        for (let n = 1; n <= repeats; n++) {
          const label = `${model} · ${format.name} · run ${n}`;
          try {
            const t0 = Date.now();
            const draft = await call({ name: "script_draft", ...draftPrompt(base, { brief: confirmed, card }), schema: draftOutputSchema });
            const draftMs = Date.now() - t0;
            const doc = toScriptDoc(draft, { reelNumber: card.reelNumber, avatarIds });
            const checks = scoreDraft(doc, { beats: card.beats, clientText, neverList, shots: [4, 20], seconds: [20, 90] });

            // Every format opens on HOOK, so the edit is the same everywhere.
            const t1 = Date.now();
            const edit = await call({ name: "script_edit", ...editPrompt(base, { doc, notes: EMPTY_NOTES, openItems: fillToFinal(doc, EMPTY_NOTES), lastAssistant: "", text: "Make the HOOK punchier." }), schema: editTurnSchema });
            const editMs = Date.now() - t1;
            const applied = applyOps(doc, EMPTY_NOTES, edit.ops, { newShotId, avatarIds: new Set() });
            checks.push(applied.ok ? scoreEditIsolation(doc, applied.doc, "HOOK") : { name: "edit isolation", pass: false, detail: applied.error });

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
            // D380 — and each row keeps its shot's name, in order.
            const names: string[] = (parsed?.visual_script?.shots ?? []).map((s: { label?: string }) => (s.label ?? "").trim().toUpperCase());
            const want = doc.shots.map((_, i) => `S${i + 1}`);
            checks.push({ name: "shot names", pass: JSON.stringify(names) === JSON.stringify(want), detail: names.join(" ") });

            const passed = checks.filter((c) => c.pass).length;
            writeFileSync(path.join(OUT, `${slug}-${model}-${format.name.replace(/\W+/g, "-")}-${n}.md`), [
              `# ${label}`, "", `Card beats: ${card.beats.join(" › ")}`, `Chips offered: ${draft.suggestions.join(" | ")}`, "", printed, "",
              "## Checks", ...checks.map((c) => `- ${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`), "", `Edit reply: ${edit.reply}`,
            ].join("\n"));
            report.push(`## ${label}`, `${passed}/${checks.length} checks · draft ${(draftMs / 1000).toFixed(1)}s · edit ${(editMs / 1000).toFixed(1)}s`, ...checks.filter((c) => !c.pass).map((c) => `- FAIL ${c.name}: ${c.detail}`), "");
          } catch (e) {
            report.push(`## ${label}`, `ERROR: ${e instanceof Error ? e.message : String(e)}`, "");
          }
        }
      }
    }
    writeFileSync(path.join(OUT, `REPORT-${slug}.md`), report.join("\n"));
    console.log(`\nProbe written to ${OUT}\n\n${report.join("\n")}`);
  }, 1_800_000);
});
