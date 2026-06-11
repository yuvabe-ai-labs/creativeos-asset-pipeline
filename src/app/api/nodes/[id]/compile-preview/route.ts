import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compile-preview — resolve the node's inputs WITHOUT calling
// the model, and return them as structured parts. Powers the Prompt focus view's
// Ambient + Connected context cards (the Inline instruction is client-side state,
// so it is not echoed back here).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as { slices?: unknown } | null;

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  return apiOk({
    ambient: resolved.clientContext,
    connected: resolved.upstream.map((u) => ({
      nodeId: u.nodeId,
      label: u.label,
      type: u.type,
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    })),
  });
}
