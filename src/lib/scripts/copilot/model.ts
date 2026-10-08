import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { createGemini } from "@/lib/gemini/server";

// One structured call over either provider already in the repo (D335): no new SDK. The model id
// picks the provider. The result is validated against the same zod schema either way.

export type StructuredCall = <S extends z.ZodType>(args: { name: string; system: string; user: string; schema: S }) => Promise<z.infer<S>>;

export function structuredCaller(model: string): StructuredCall {
  return async (args) => {
    if (model.startsWith("gemini-")) {
      const response = await createGemini().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        config: {
          systemInstruction: args.system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(args.schema),
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
