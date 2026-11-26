// One structured Gemini call for image analysis (D312): a Zod schema in, parsed JSON out.
import "server-only";
import { z } from "zod";
import { MediaResolution } from "@google/genai";
import { createGemini } from "@/lib/gemini/server";
import { recordProviderCost } from "@/lib/generations/record-cost";
import { geminiCost, type RecordFor } from "@/lib/generations/record-for";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateStructured<S extends z.ZodType>(args: {
  model: string;
  system: string;
  parts: GeminiPart[];
  schema: S;
  /** D560 — whom the call's cost is recorded for; without it nothing is recorded. */
  recordFor?: RecordFor;
}): Promise<z.infer<S>> {
  const ai = createGemini();
  const response = await ai.models.generateContent({
    model: args.model,
    contents: [{ role: "user", parts: args.parts }],
    config: {
      systemInstruction: args.system,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(args.schema),
      temperature: 0.2,
      // Medium reads an image at ~546 tokens: enough detail for colours and text, a third of high.
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    },
  });
  // Runs in the image-analysis task, so the record is awaited; it never throws.
  const cost = geminiCost(args.recordFor, "image_analysis", args.model, response.usageMetadata);
  if (cost) await recordProviderCost(cost);
  const raw = response.text ?? "";
  if (!raw) throw new Error(`${args.model} returned no content`);
  return args.schema.parse(JSON.parse(raw));
}
