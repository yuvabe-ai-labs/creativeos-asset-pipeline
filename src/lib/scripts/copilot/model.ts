import "server-only";
import { z } from "zod";
import { ThinkingLevel } from "@google/genai";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { createGemini } from "@/lib/gemini/server";

// One structured call over either provider already in the repo (D335): no new SDK. The model id
// picks the provider. The result is validated against the same zod schema either way.

export type StructuredCall = <S extends z.ZodType>(args: { name: string; system: string; user: string; schema: S }) => Promise<z.infer<S>>;

/** `thinking: "low"` asks a Gemini model to reason less, which is much faster; ignored for OpenAI. */
export function structuredCaller(model: string, opts: { thinking?: "low" } = {}): StructuredCall {
  return async (args) => {
    if (model.startsWith("gemini-")) {
      const response = await createGemini().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        config: {
          systemInstruction: args.system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(args.schema),
          ...(opts.thinking === "low" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
      const raw = response.text ?? "";
      if (!raw) throw new Error(`${model} returned no content`);
      return args.schema.parse(JSON.parse(raw));
    }
    const response = await createOpenAI().responses.parse({
      model,
      input: [{ role: "system", content: args.system }, { role: "user", content: args.user }],
      text: { format: zodTextFormat(args.schema, args.name) },
    });
    if (!response.output_parsed) throw new Error(`${model} returned no content`);
    return args.schema.parse(response.output_parsed);
  };
}

export type StreamingCall = <S extends z.ZodType>(
  args: { name: string; system: string; user: string; schema: S },
  onText: (textSoFar: string) => void,
) => Promise<z.infer<S>>;

/** As structuredCaller, but reports the answer's text as it arrives (Gemini streams it), so the first
 *  draft can be shown while it is written (D336, refined). The whole answer is validated at the end.
 *  An OpenAI model answers in one piece: its text is reported once. */
export function streamingCaller(model: string): StreamingCall {
  return async (args, onText) => {
    if (!model.startsWith("gemini-")) {
      const result = await structuredCaller(model)(args);
      onText(JSON.stringify(result));
      return result;
    }
    const stream = await createGemini().models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: args.user }] }],
      config: {
        systemInstruction: args.system,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(args.schema),
      },
    });
    let text = "";
    for await (const chunk of stream) {
      text += chunk.text ?? "";
      onText(text);
    }
    if (!text) throw new Error(`${model} returned no content`);
    return args.schema.parse(JSON.parse(text));
  };
}
