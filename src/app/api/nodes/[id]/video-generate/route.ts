import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertGeneration } from "@/lib/db/generations";
import { videoGenRegistry, DEFAULT_VIDEO_MODEL_ID } from "@/lib/video-gen/registry";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

const ImageRoleSchema = z.enum(["start_frame", "end_frame", "reference"]);

const GenerateBodySchema = z.object({
  modelId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  imageRoles: z.record(z.string(), ImageRoleSchema).optional(),
  mock: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async (nodeId, _node, caller, clientId) => {
    const raw = await req.json().catch(() => null);
    const parsed = GenerateBodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(`Invalid request body: ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
    }
    const body = parsed.data;

    const modelId = body.modelId ?? DEFAULT_VIDEO_MODEL_ID;
    const config = videoGenRegistry[modelId];
    if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

    // Build params using model's param specs (defaults where not provided)
    const bodyParams = body.params ?? {};
    const resolvedParams = Object.fromEntries(
      config.params.map((spec) => [
        spec.name,
        bodyParams[spec.name] ?? spec.defaultValue,
      ]),
    );

    // Image role assignments sent from focus view
    const imageRoles = body.imageRoles ?? {};

    // Resolve upstream nodes — same 2-level traversal as upstream-images route
    const upstream = await getUpstreamOutputs(nodeId);

    // Find video-prompt node
    const videoPromptNode = upstream.find((u) => u.type === "video-prompt");
    if (!videoPromptNode?.activeOutput) {
      return apiError("No connected video-prompt node with output found.", 400);
    }
    const prompt = String(videoPromptNode.activeOutput);

    // Also collect images upstream of the video-prompt node so that
    // image → video-prompt → video-gen connections resolve correctly.
    const videoPromptUpstream = await getUpstreamOutputs(videoPromptNode.nodeId);
    const seenIds = new Set(upstream.map((u) => u.nodeId));
    const allUpstream = [
      ...upstream,
      ...videoPromptUpstream.filter((u) => !seenIds.has(u.nodeId)),
    ];

    // image-gen nodes are valid when directly connected; not via the grandparent path.
    const directIds = new Set(upstream.map((u) => u.nodeId));

    // Resolve image roles from upstream nodes
    let startFrameUrl: string | undefined;
    let endFrameUrl: string | undefined;
    const referenceUrls: string[] = [];

    for (const node of allUpstream) {
      let url: string | undefined;
      if (node.type === "file" || node.type === "draw") {
        const data = node.data as Record<string, unknown>;
        if (data.fileKind !== "image") continue;
        url = typeof data.fileUrl === "string" ? data.fileUrl : undefined;
      } else if (node.type === "image-gen" && directIds.has(node.nodeId)) {
        url = typeof node.activeOutput === "string" ? node.activeOutput : undefined;
      }
      if (!url) continue;
      const role = imageRoles[node.nodeId] ?? "reference";
      if (role === "start_frame" && !startFrameUrl) startFrameUrl = url;
      else if (role === "end_frame" && !endFrameUrl) endFrameUrl = url;
      else if (role === "reference") referenceUrls.push(url);
    }

    // Cap reference images at the model's declared limit
    const maxRefs = config.imageInputs.maxReferenceImages;
    if (referenceUrls.length > maxRefs) referenceUrls.splice(maxRefs);
    // If model doesn't support end frame, clear it
    if (!config.imageInputs.endFrame) endFrameUrl = undefined;

    const mockMode = body.mock === true;

    // Insert generation record (status: 'running')
    const generation = await insertGeneration({
      nodeId,
      orgId: caller.orgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "video",
      modelUsed: modelId,
      paramsSnapshot: resolvedParams,
      inputsSnapshot: {
        videoPromptNodeId: videoPromptNode.nodeId,
        videoPromptVersionId: videoPromptNode.versionId,
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls,
      },
    });

    // Fire Trigger.dev task (no await — the task runs in the background)
    await tasks.trigger("video-generate", {
      generationId: generation.id,
      modelId,
      prompt,
      startFrameUrl,
      endFrameUrl,
      referenceUrls,
      params: resolvedParams,
      mockMode,
    });

    return apiOk({ generationId: generation.id }, 202);
  });
}
