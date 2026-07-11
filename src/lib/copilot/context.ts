import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { describeNode, nodeHandle } from "@/lib/nodes/describe-node";

// The copilot's grounding text — the canvas rendered for the model. Extracted here
// because all three copilot calls (prose, references, actions) need the same view.
//
// Two things it now carries beyond the raw list:
//   • each node's HANDLE (so the model can resolve an "@PRM-A3F9" the human typed, and
//     refer back to nodes in the same vocabulary the user sees on the canvas), and
//   • a "referenced" section for @-mentioned nodes — human-directed grounding: the human
//     named exact nodes, so we spotlight them instead of letting the model guess.
export async function buildCopilotContext(
  canvasId: string,
  mentionedIds: string[] = [],
): Promise<string> {
  const nodes = await listNodes(canvasId);
  const edges = await listEdges(canvasId);
  if (nodes.length === 0) {
    return "The canvas is currently empty (it has no nodes).";
  }

  // [id …] stays internal (never shown to the user); the handle is the human-facing name.
  const line = (n: (typeof nodes)[number]) =>
    `- ${nodeHandle(n)} (${n.type}): ${describeNode(n)} [id ${n.id}]`;

  let context =
    `The canvas has ${nodes.length} node(s):\n` +
    nodes.map(line).join("\n") +
    `\nThere are ${edges.length} connection(s) between them.`;

  const mentioned = nodes.filter((n) => mentionedIds.includes(n.id));
  if (mentioned.length > 0) {
    context +=
      `\n\nThe user explicitly @-referenced these node(s) — focus your answer on them:\n` +
      mentioned.map((n) => `- ${nodeHandle(n)} (${n.type}): ${describeNode(n)}`).join("\n");
  }

  return context;
}
