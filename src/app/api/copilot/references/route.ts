import { apiError, apiOk } from "@/lib/api/route-helpers";
import { createOpenAI } from "@/lib/openai/server";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { describeNode } from "@/lib/nodes/describe-node";

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
  if (!canvasId) return apiError("A 'canvasId' is required.", 400);

  const nodes = await listNodes(canvasId);
  const edges = await listEdges(canvasId);
  const canvasContext =
    nodes.length === 0
      ? "The canvas is empty."
      : `The canvas has ${nodes.length} node(s):\n` +
        nodes.map((n) => `- ${n.type}: ${describeNode(n)} (id ${n.id})`).join("\n") +
        `\nThere are ${edges.length} connection(s).`;

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

    const content = completion.choices[0]?.message?.content ?? '{"referencedNodes":[]}';
    const parsed = JSON.parse(content) as {
      referencedNodes: { id: string; label: string; type: string }[];
    };
    return apiOk({ referencedNodes: parsed.referencedNodes ?? [] });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "References lookup failed.", 500);
  }
}
