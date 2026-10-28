import { describe, it, expect } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { kbExtractPrompt } from "../kb-extract";
import { TraceableBrandKBSchema } from "@/lib/kb/schema";
import { LEAKED_KB_EXAMPLES } from "@/lib/kb/fixtures/leaked-examples";

// Every .describe() string reaches the model as the JSON-schema description of its field, read
// right where the model writes that field. Example values there were copied into client KBs
// verbatim whenever the sources were silent (36 of 58 staging KBs, October 2026).
const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });
const jsonSchema = zodTextFormat(DocExtractionSchema, "brand_kb").schema as Record<string, unknown>;

function descriptions(node: unknown, path = ""): { path: string; text: string }[] {
  if (!node || typeof node !== "object") return [];
  const out: { path: string; text: string }[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj.description === "string") out.push({ path, text: obj.description });
  for (const [k, v] of Object.entries(obj)) {
    if (k === "description") continue;
    out.push(...descriptions(v, path ? `${path}.${k}` : k));
  }
  return out;
}

const COMPLIANCE_FIELDS = [
  "preferred_verbs",
  "preferred_phrases",
  "never_use_words",
  "never_use_claims",
  "never_use_tone",
  "disclaimers",
] as const;

describe("kb-extract prompt and schema", () => {
  it("carries no example value that was copied into a client KB", () => {
    const texts = [
      { path: "system prompt", text: kbExtractPrompt.system },
      ...descriptions(jsonSchema),
    ];
    const hits = texts.flatMap(({ path, text }) =>
      LEAKED_KB_EXAMPLES.filter((ex) => ex.test(text)).map((ex) => `${path}: ${ex}`),
    );
    expect(hits).toEqual([]);
  });

  it("tells the model every compliance field is null when the sources state none", () => {
    const compliance = TraceableBrandKBSchema.shape.compliance.shape;
    for (const field of COMPLIANCE_FIELDS) {
      expect(compliance[field].description, field).toMatch(/null if (they|the sources) state none/i);
    }
  });

  // "low" once meant "inferring from brand category norms", a licence to guess that the two
  // fabricated Propalyst rows were filed under.
  it("never defines low confidence as guessing from category norms", () => {
    const low = kbExtractPrompt.system.match(/"low"\s*=.*$/m)?.[0];
    expect(low).toBeDefined();
    expect(low).not.toMatch(/category norms/i);
  });

  it("is version 3.1.0", () => {
    expect(kbExtractPrompt.version).toBe("3.1.0");
  });
});
