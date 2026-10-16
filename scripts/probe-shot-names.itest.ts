// D380 — does the parse keep named shots one row each, with their names? REAL model calls
// (a few cents). Not part of `npx vitest run`.
//
//   npx vitest run --config vitest.integration.config.ts scripts/probe-shot-names.itest.ts
//
// Env: PROBE_RUNS=3. Writes REPORT.md to <os tmpdir>/shot-names-probe; nothing in the repo.
import { describe, it, beforeAll, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const RUNS = Number(process.env.PROBE_RUNS ?? 3);
const OUT = path.join(os.tmpdir(), "shot-names-probe");

const SHOT_HEADINGS = `Reel 7 — Morning ritual

Shot 1 — 0-3 sec
Close-up: steam rising from a steel tumbler of filter coffee.
VO: Every morning starts the same way.

Shot 2 — 3-7 sec
She pours the decoction, then the milk, from a height.
VO: Slow, from a height, the way her mother did.

Shot 3 — 7-10 sec
Quick cuts: the froth, her smile, the first sip.
VO: Some things you don't rush.

Shot 4 — 10-13 sec
Pack shot on the counter. Text: Brewed the old way.
VO: Brewed the old way.`;

const SCENE_HEADINGS = SHOT_HEADINGS.replace(/^Shot (\d) — (.*)$/gm, "Scene $1 | $2");

const UNNAMED = `Reel 7 — Morning ritual

0-3 sec
Close-up: steam rising from a steel tumbler of filter coffee.
VO: Every morning starts the same way.

3-7 sec
She pours the decoction, then the milk, from a height.
VO: Slow, from a height, the way her mother did.

7-13 sec
Pack shot on the counter.
VO: Brewed the old way.`;

describe("shot names probe", () => {
  it("keeps every named shot as one row, in order, with its name", async () => {
    const { scriptDocSchema } = await import("@/lib/scripts/schema");
    const { printScript } = await import("@/lib/scripts/print");
    const { compileScript } = await import("@/lib/nodes/script");
    const { scriptParsePrompt } = await import("@/prompts/script-parse");
    const { createOpenAI } = await import("@/lib/openai/server");

    const doc = scriptDocSchema.parse(reel01);
    const cases = [
      { key: "copilot", source: printScript(doc), expected: doc.shots.map((_, i) => `S${i + 1}`) },
      { key: "shot-headings", source: SHOT_HEADINGS, expected: ["Shot 1", "Shot 2", "Shot 3", "Shot 4"] },
      { key: "scene-headings", source: SCENE_HEADINGS, expected: ["Scene 1", "Scene 2", "Scene 3", "Scene 4"] },
      { key: "unnamed", source: UNNAMED, expected: ["", "", ""] },
    ];

    mkdirSync(OUT, { recursive: true });
    const report: string[] = ["# Shot names probe", "", `Prompt v${scriptParsePrompt.version} · ${scriptParsePrompt.model} · ${RUNS} runs each`, ""];
    const failures: string[] = [];

    for (const c of cases) {
      for (let n = 1; n <= RUNS; n++) {
        const { system, user } = compileScript(c.source, "", "", "tint");
        const completion = await createOpenAI().chat.completions.create({
          model: scriptParsePrompt.model,
          response_format: { type: "json_schema", json_schema: { name: "reel_script", schema: scriptParsePrompt.schema, strict: true } },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
        const labels: string[] = (parsed?.visual_script?.shots ?? []).map((s: { label?: string }) => (s.label ?? "").trim());
        const pass =
          labels.length === c.expected.length &&
          labels.every((l, i) => l.toUpperCase() === c.expected[i].toUpperCase());
        const line = `- ${pass ? "PASS" : "FAIL"} ${c.key} #${n}: ${JSON.stringify(labels)}`;
        report.push(line);
        if (!pass) failures.push(`${line} (expected ${JSON.stringify(c.expected)})`);
      }
    }

    writeFileSync(path.join(OUT, "REPORT.md"), report.join("\n"));
    console.log(`\nProbe written to ${OUT}\n\n${report.join("\n")}`);
    expect(failures).toEqual([]);
  }, 900_000);
});
