import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { TraceableBrandKBSchema } from "@/lib/kb/schema";
import { LEAKED_KB_EXAMPLES } from "@/lib/kb/fixtures/leaked-examples";

// Live check (paid, 3 gpt-5.4-mini calls): runs the real extraction on saved website-only
// briefs, the case where examples leaked, and fails if a compliance value matches a former
// example that its brief never says. Opt-in:
//   KB_LEAK_EVAL=1 OPENAI_API_KEY=… npx vitest run src/lib/kb/__tests__/kb-extract-leak.live.test.ts
const RUNS_PER_BRIEF = 3;
const BRIEFS = ["propalyst"];
const FIXTURES = path.join(__dirname, "../fixtures");
const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });

async function extractCompliance(brief: string) {
  const res = await createOpenAI().responses.parse({
    model: kbExtractPrompt.model,
    input: [
      { role: "system", content: kbExtractPrompt.system },
      { role: "user", content: [
        { type: "input_text", text: `--- Brand website research ---\n${brief}` },
        { type: "input_text", text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings." },
      ] },
    ],
    text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
    temperature: 0.5,
  });
  if (!res.output_parsed) throw new Error("Model returned no parsed output.");
  return res.output_parsed.compliance;
}

describe.skipIf(!process.env.KB_LEAK_EVAL)("kb-extract leak (live)", () => {
  for (const name of BRIEFS) {
    it(`copies no former example into ${name}'s compliance`, async () => {
      const brief = fs.readFileSync(path.join(FIXTURES, `website-research.${name}.md`), "utf8");
      const runs = await Promise.all(
        Array.from({ length: RUNS_PER_BRIEF }, () => extractCompliance(brief)),
      );
      const leaked = runs.flatMap((compliance) =>
        Object.entries(compliance).flatMap(([field, f]) =>
          // Lists, or prose (content_rules): every value is checked.
          ([] as string[]).concat(f.value ?? []).filter((v: string) =>
            LEAKED_KB_EXAMPLES.some((ex) => ex.test(v) && !ex.test(brief)),
          ).map((v: string) => `${field}: ${v}`),
        ),
      );
      expect(leaked).toEqual([]);
    }, 180_000);
  }
});
