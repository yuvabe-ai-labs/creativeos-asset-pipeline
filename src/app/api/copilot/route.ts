import { apiError } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { describeNode } from "@/lib/nodes/describe-node";

// Lesson 3 — STREAMING. Instead of waiting for the whole reply and returning one
// JSON blob, we ask the model to STREAM, and forward each token chunk to the
// browser as it arrives. The panel reads them and appends live (the "typing" feel).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { message?: string; canvasId?: string }
    | null;
  const message = body?.message?.trim();
  const canvasId = body?.canvasId;
  if (!message) return apiError("A 'message' is required.", 400);
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);

  // Grounding (Lesson 2) — unchanged: read the real canvas and describe it.
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

    // stream: true → instead of ONE final message, we get an async stream of
    // small "delta" chunks as the model generates them.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are the copilot inside CreativeOS. You CAN see the canvas — it is " +
            "described in the next message. Be brief and concrete; refer to nodes by " +
            "their label and type. Each node lists an internal id for YOUR reference " +
            "when acting on it later — never show raw ids to the user unless they ask.",
        },
        { role: "system", content: canvasContext },
        { role: "user", content: message },
      ],
    });

    // Bridge the model's async stream into a web ReadableStream the browser reads.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta)); // push each token out
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
