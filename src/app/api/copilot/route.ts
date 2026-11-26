import { apiError, withBodyCanvas } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { buildCopilotContext } from "@/lib/copilot/context";
import { copilotRecordFor } from "@/lib/copilot/record-for";
import { openAiCost, recordAfterResponse, type OpenAiChatUsage } from "@/lib/generations/record-for";

const MODEL = "gpt-4o-mini";

// Lesson 4 (two-call, simplest path) — CALL 1: stream the PROSE reply as plain text
// (same as Lesson 3). The node chips come from a SEPARATE structured call:
// /api/copilot/references. No partial-JSON parsing needed anywhere.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { messages?: { role: "user" | "assistant"; content: string }[]; canvasId?: string; mentionedIds?: string[] }
    | null;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const canvasId = body?.canvasId;
  if (history.length === 0) return apiError("A 'messages' history is required.", 400);
  if (typeof canvasId !== "string" || !canvasId) return apiError("Open a canvas to use the copilot.", 400);

  // The canvas must be in the caller's org before anything of it is read (withBodyCanvas).
  return withBodyCanvas(req, canvasId, { need: "generate" }, async (canvas, caller) => {
    const recordFor = copilotRecordFor(canvas, caller);

    try {
      // Grounding (Lesson 2), now with handles + the human's @-referenced nodes spotlighted.
      const canvasContext = await buildCopilotContext(canvas.id, body?.mentionedIds ?? []);
      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model: MODEL,
        stream: true,
        // D560 — the last chunk then carries the call's usage, so its cost can be recorded.
        stream_options: { include_usage: true },
        messages: [
          {
            role: "system",
            content:
              "You are the copilot inside CreativeOS. You CAN see the canvas — it is described " +
              "in the next message. Be brief and concrete. Refer to nodes by their HANDLE (e.g. " +
              "PRM-A3F9) and type; the user sees the same handles on the canvas. When the user " +
              "writes an @HANDLE, that is a specific node they are pointing at — use it. Each node " +
              "also lists a bracketed internal [id …] for your reference only — never show it.",
          },
          { role: "system", content: canvasContext },
          ...history,
        ],
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Recorded once when the stream ends, also when it breaks, from whatever usage arrived.
          let usage: OpenAiChatUsage | undefined;
          try {
            for await (const chunk of completion) {
              if (chunk.usage) usage = chunk.usage;
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            }
          } finally {
            recordAfterResponse(openAiCost(recordFor, "copilot", MODEL, usage, "chat"));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    } catch (e) {
      console.error("[copilot]", e instanceof Error ? e.message : e);
      return apiError("The copilot couldn't answer just now. Please try again.", 500);
    }
  });
}
