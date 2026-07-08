import { apiError } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { describeNode } from "@/lib/nodes/describe-node";

// Lesson 4 (two-call, simplest path) — CALL 1: stream the PROSE reply as plain text
// (same as Lesson 3). The node chips come from a SEPARATE structured call:
// /api/copilot/references. No partial-JSON parsing needed anywhere.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { message?: string; canvasId?: string }
    | null;
  const message = body?.message?.trim();
  const canvasId = body?.canvasId;
  if (!message) return apiError("A 'message' is required.", 400);
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);

  // Grounding (Lesson 2) — unchanged.
  const nodes = await listNodes(canvasId);
  const edges = await listEdges(canvasId);
  const canvasContext =
    nodes.length === 0
      ? "The canvas is currently empty (it has no nodes)."
      : `The canvas has ${nodes.length} node(s):\n` +
        nodes.map((n) => `- ${n.type}: ${describeNode(n)} (id ${n.id})`).join("\n") +
        `\nThere are ${edges.length} connection(s) between them.`;

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. You CAN see the canvas — it is described " +
            "in the next message. Be brief and concrete; refer to nodes by their label and type. " +
            "Each node lists an internal id for reference only — never show raw ids to the user.",
        },
        { role: "system", content: canvasContext },
        { role: "user", content: message },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Copilot request failed.", 500);
  }
}
