import { tasks } from "@trigger.dev/sdk/v3";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertGeneration } from "@/lib/db/generations";
import { videoGenRegistry, DEFAULT_VIDEO_MODEL_ID } from "@/lib/video-gen/registry";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { modelId?: unknown; params?: unknown; imageRoles?: unknown; mock?: unknown }
    | null;

  const modelId =
    typeof body?.modelId === "string" ? body.modelId : DEFAULT_VIDEO_MODEL_ID;
  const config = videoGenRegistry[modelId];
  if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

  // Build params using model's param specs (defaults where not provided)
  const bodyParams = (body?.params ?? {}) as Record<string, unknown>;
  const resolvedParams = Object.fromEntries(
    config.params.map((spec) => [
      spec.name,
      bodyParams[spec.name] ?? spec.defaultValue,
    ]),
  );

  // Image role assignments sent from focus view
  const imageRoles = (body?.imageRoles ?? {}) as Record<
    string,
    "start_frame" | "end_frame" | "reference"
  >;

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

  // Resolve image roles from upstream nodes
  let startFrameUrl: string | undefined;
  let endFrameUrl: string | undefined;
  const referenceUrls: string[] = [];

  for (const node of allUpstream) {
    if (node.type === "image-gen") {
      const url = typeof node.activeOutput === "string" ? node.activeOutput : undefined;
      if (!url) continue;
      const role = imageRoles[node.nodeId] ?? "start_frame";
      if (role === "start_frame" && !startFrameUrl) startFrameUrl = url;
      else if (role === "end_frame" && !endFrameUrl) endFrameUrl = url;
      else if (role === "reference") referenceUrls.push(url);
    } else if (node.type === "file") {
      const data = node.data as Record<string, unknown>;
      if (data.fileKind !== "image") continue;
      const url = typeof data.fileUrl === "string" ? data.fileUrl : undefined;
      if (!url) continue;
      const role = imageRoles[node.nodeId] ?? "reference";
      if (role === "start_frame" && !startFrameUrl) startFrameUrl = url;
      else if (role === "end_frame" && !endFrameUrl) endFrameUrl = url;
      else if (role === "reference") referenceUrls.push(url);
    }
  }

  // Cap reference images at the model's declared limit
  const maxRefs = config.imageInputs.maxReferenceImages;
  if (referenceUrls.length > maxRefs) referenceUrls.splice(maxRefs);
  // If model doesn't support end frame, clear it
  if (!config.imageInputs.endFrame) endFrameUrl = undefined;

  const mockMode = body?.mock === true;

  // Insert generation record (status: 'running')
  const generation = await insertGeneration({
    nodeId,
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
}
