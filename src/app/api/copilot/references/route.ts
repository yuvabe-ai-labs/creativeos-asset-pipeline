import { apiError, apiOk, withBodyCanvas } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { buildCopilotContext } from "@/lib/copilot/context";
import { copilotRecordFor } from "@/lib/copilot/record-for";
import { openAiCost, recordAfterResponse } from "@/lib/generations/record-for";

// Lesson 4 — CALL 2: a plain (non-streaming) STRUCTURED call. Given the answer the
// copilot just streamed, it returns which canvas nodes that answer referenced, as
// typed data → { referencedNodes: [{ id, label, type }] } → rendered as clickable chips.
// Same response_format pattern as your Script parse route.
const refsSchema = {
  type: "object",
  properties: {
    referencedNodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string" },
        },
        required: ["id", "label", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["referencedNodes"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { message?: string; canvasId?: string; reply?: string }
    | null;
  const canvasId = body?.canvasId;
  if (typeof canvasId !== "string" || !canvasId) return apiError("Open a canvas to use the copilot.", 400);

  // The canvas must be in the caller's org before anything of it is read (withBodyCanvas).
  return withBodyCanvas(req, canvasId, { need: "generate" }, async (canvas, caller) => {
    const recordFor = copilotRecordFor(canvas, caller);
    const model = "gpt-4o-mini";

    try {
      const canvasContext = await buildCopilotContext(canvas.id);
      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model,
        response_format: {
          type: "json_schema",
          json_schema: { name: "copilot_refs", schema: refsSchema, strict: true },
        },
        messages: [
          {
            role: "system",
            content:
              "Given the canvas below, the user's question, and the assistant's answer, list the " +
              "nodes the answer actually refers to, using the ids from the canvas description. " +
              "Return an empty array if it refers to none.",
          },
          { role: "system", content: canvasContext },
          {
            role: "user",
            content: `User asked: ${body?.message ?? ""}\n\nAssistant answered: ${body?.reply ?? ""}`,
          },
        ],
      });
      // D560 — paid once it answered, whatever the answer turns out to be.
      recordAfterResponse(openAiCost(recordFor, "copilot", model, completion.usage, "chat"));

      const content = completion.choices[0]?.message?.content ?? '{"referencedNodes":[]}';
      const parsed = JSON.parse(content) as {
        referencedNodes: { id: string; label: string; type: string }[];
      };
      return apiOk({ referencedNodes: parsed.referencedNodes ?? [] });
    } catch (e) {
      console.error("[copilot/references]", e instanceof Error ? e.message : e);
      return apiError("The copilot couldn't find the nodes it mentioned. Please try again.", 500);
    }
  });
}
