import "server-only";
import { z } from "zod";
import { ThinkingLevel } from "@google/genai";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { createGemini } from "@/lib/gemini/server";
import type { RecordOnlyType } from "@/lib/db/types";
import { geminiCost, recordAfterResponse, type GeminiUsage, type RecordFor } from "@/lib/generations/record-for";

// One structured call over either provider already in the repo (D336): no new SDK. The model id
// picks the provider. The result is validated against the same zod schema either way.

export type StructuredCall = <S extends z.ZodType>(args: { name: string; system: string; user: string; schema: S }) => Promise<z.infer<S>>;

/** D537 — whom a call's cost is recorded for, and as what. Without it nothing is recorded. */
export type Recording = { recordFor?: undefined; recordType?: undefined } | { recordFor: RecordFor; recordType: RecordOnlyType };

/** `thinking: "low"` asks a Gemini model to reason less, which is much faster; ignored for OpenAI.
 *  Each Gemini call's cost is recorded once, after the response (D537). */
export function structuredCaller(model: string, opts: { thinking?: "low" } & Recording = {}): StructuredCall {
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
      // Paid once it answered, whatever the answer turns out to be.
      if (opts.recordType) recordAfterResponse(geminiCost(opts.recordFor, opts.recordType, model, response.usageMetadata));
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
 *  draft can be shown while it is written (D337, refined). The whole answer is validated at the end.
 *  An OpenAI model answers in one piece: its text is reported once. */
export function streamingCaller(model: string, opts: Recording = {}): StreamingCall {
  return async (args, onText) => {
    if (!model.startsWith("gemini-")) {
      const result = await structuredCaller(model, opts)(args);
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
    // The last chunk that carries usage holds the call's totals. Recorded once when the stream ends,
    // also when it breaks or the reader goes away, from whatever usage had arrived (D537).
    let usage: GeminiUsage | undefined;
    try {
      for await (const chunk of stream) {
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        text += chunk.text ?? "";
        onText(text);
      }
    } finally {
      if (opts.recordType) recordAfterResponse(geminiCost(opts.recordFor, opts.recordType, model, usage));
    }
    if (!text) throw new Error(`${model} returned no content`);
    return args.schema.parse(JSON.parse(text));
  };
}
