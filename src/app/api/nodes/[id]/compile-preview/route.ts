import {
  resolvePromptInputs,
  resolveVideoPromptInputs,
  resolveMultishotPromptInputs,
} from "@/lib/nodes/resolve-inputs";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compile-preview — resolve the node's inputs WITHOUT calling
// the model, and return them as structured parts. Powers the Prompt and Video Prompt
// focus views' Ambient + Connected context cards (the Inline instruction is
// client-side state, so it is not echoed back here).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node) => {
    const body = (await req.json().catch(() => null)) as { slices?: unknown } | null;

    // Video Prompt has its own resolver: an image-gen upstream travels as a vision
    // fileUrl there (mapUpstreamForVideo), never as text — unlike the image-Prompt
    // path, where the same upstream type means something different (D6/D19 — see
    // resolve-inputs.ts). Using the wrong resolver here silently drops fileUrl and
    // leaks the raw image URL into the connected-node preview as plain text.
    // Multishot Prompt needs its OWN resolver for the same reason Video Prompt does: falling
    // through to resolvePromptInputs runs the image-prompt path, whose upstream shape is
    // different, so the focus view's connected-node rail resolved to nothing at all.
    const resolved =
      node.type === "video-prompt"
        ? await resolveVideoPromptInputs(nodeId, body?.slices)
        : node.type === "multishot-prompt"
          ? await resolveMultishotPromptInputs(nodeId, body?.slices)
          : await resolvePromptInputs(nodeId, body?.slices);
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
  });
}
