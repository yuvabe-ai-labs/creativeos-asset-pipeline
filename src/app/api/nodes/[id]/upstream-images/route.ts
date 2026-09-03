import { getUpstreamOutputs } from "@/lib/db/nodes";
import { renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    try {
      const direct = await getUpstreamOutputs(nodeId);

      // Also collect upstream of any prompt nodes (2-level traversal) — video-prompt OR
      // multishot-prompt. Surfaces file/draw nodes in pattern: node → prompt-node → video-gen.
      const promptNodes = direct.filter(
        (u) => u.type === "video-prompt" || u.type === "multishot-prompt",
      );
      const promptUpstreamBatches = await Promise.all(
        promptNodes.map((u) => getUpstreamOutputs(u.nodeId)),
      );

      // Merge and deduplicate; direct edges take precedence.
      const seen = new Map(direct.map((u) => [u.nodeId, u]));
      for (const batch of promptUpstreamBatches) {
        for (const u of batch) {
          if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
        }
      }
      const allUpstream = Array.from(seen.values());

      // image-gen nodes are valid when directly connected to this node,
      // but not when inherited through the grandparent (prompt-node) path.
      const directIds = new Set(direct.map((u) => u.nodeId));

      const images = allUpstream
        .filter((u) => {
          if (u.type === "file" || u.type === "draw") {
            const d = u.data as Record<string, unknown>;
            return d.fileKind === "image" && typeof d.fileUrl === "string";
          }
          if (u.type === "image-gen" && directIds.has(u.nodeId)) {
            return typeof u.activeOutput === "string";
          }
          return false;
        })
        .map((u) => {
          const d = u.data as Record<string, unknown>;
          return {
            id: u.nodeId,
            type: u.type,
            imageUrl: u.type === "image-gen"
              ? (u.activeOutput as string)
              : (d.fileUrl as string),
            filename: typeof d.filename === "string" ? d.filename : undefined,
            fileSizeBytes: d.fileSizeBytes as number | undefined,
            imageWidth: d.imageWidth as number | undefined,
            imageHeight: d.imageHeight as number | undefined,
          };
        });

      // Surface the connected prompt node so the focus view can display its motion prompt text —
      // a video-prompt node's string output directly, or a multishot-prompt node's MultishotPlan
      // rendered against its own upstream Multishot node's cuts (same renderPlan the money path
      // uses in resolve-prompt.ts). Never the raw object — that would print "[object Object]".
      const connectedPromptNode = direct.find(
        (u) => u.type === "video-prompt" || u.type === "multishot-prompt",
      );
      const promptNodeIndex = connectedPromptNode ? promptNodes.indexOf(connectedPromptNode) : -1;

      let promptText: string | null = null;
      if (connectedPromptNode?.type === "video-prompt") {
        promptText = typeof connectedPromptNode.activeOutput === "string"
          ? connectedPromptNode.activeOutput
          : null;
      } else if (connectedPromptNode?.type === "multishot-prompt") {
        const plan = connectedPromptNode.activeOutput as MultishotPlan | null | undefined;
        const ownUpstream = promptNodeIndex >= 0 ? promptUpstreamBatches[promptNodeIndex] : [];
        const multishotNode = ownUpstream.find((u) => u.type === "multishot");
        const cuts = ((multishotNode?.data.cuts as MultishotCut[] | undefined) ?? []).filter(
          (c) => c && c.id && typeof c.text === "string" && typeof c.seconds === "number",
        );
        if (plan && typeof plan === "object" && Array.isArray(plan.beats) && cuts.length > 0) {
          promptText = renderPlan(plan, cuts);
        }
      }

      const promptNode = connectedPromptNode
        ? { id: connectedPromptNode.nodeId, type: connectedPromptNode.type, text: promptText }
        : null;

      return apiOk({ images, promptNode });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to resolve upstream images";
      return apiError(message, 500);
    }
  });
}
