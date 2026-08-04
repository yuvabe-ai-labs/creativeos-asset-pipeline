import { getUpstreamOutputs } from "@/lib/db/nodes";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    try {
      const direct = await getUpstreamOutputs(nodeId);

      // Also collect upstream of any video-prompt nodes (2-level traversal).
      // Surfaces file/draw nodes in pattern: node → video-prompt → video-gen.
      const videoPromptUpstream = await Promise.all(
        direct
          .filter((u) => u.type === "video-prompt")
          .map((u) => getUpstreamOutputs(u.nodeId)),
      );

      // Merge and deduplicate; direct edges take precedence.
      const seen = new Map(direct.map((u) => [u.nodeId, u]));
      for (const batch of videoPromptUpstream) {
        for (const u of batch) {
          if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
        }
      }
      const allUpstream = Array.from(seen.values());

      // image-gen nodes are valid when directly connected to this node,
      // but not when inherited through the grandparent (video-prompt) path.
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

      // Surface the connected video-prompt node so the focus view can display the motion prompt text.
      const videoPromptNode = direct.find((u) => u.type === "video-prompt");
      const promptNode = videoPromptNode
        ? {
            id: videoPromptNode.nodeId,
            text: typeof videoPromptNode.activeOutput === "string" ? videoPromptNode.activeOutput : null,
          }
        : null;

      return apiOk({ images, promptNode });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to resolve upstream images";
      return apiError(message, 500);
    }
  });
}
