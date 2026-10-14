// One structured Gemini call for image analysis (D312): a Zod schema in, parsed JSON out.
import "server-only";
import { z } from "zod";
import { MediaResolution } from "@google/genai";
import { createGemini } from "@/lib/gemini/server";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function generateStructured<S extends z.ZodType>(args: {
  model: string;
  system: string;
  parts: GeminiPart[];
  schema: S;
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
  const raw = response.text ?? "";
  if (!raw) throw new Error(`${args.model} returned no content`);
  return args.schema.parse(JSON.parse(raw));
}
