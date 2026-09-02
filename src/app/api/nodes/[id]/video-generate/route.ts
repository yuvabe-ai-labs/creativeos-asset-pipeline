import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { videoGenRegistry, DEFAULT_VIDEO_MODEL_ID } from "@/lib/video-gen/registry";
// Constraint rules live in client-models.ts, which is the single source of truth for them —
// the server registry carries only what generation needs. Importing it here is safe: that
// module has no `server-only` dependency, it is plain param specs and rule data.
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { validateAgainstRules } from "@/lib/video-gen/constraints";
import {
  assignImageRoles,
  autoAssignImageRoles,
  orderImagesForPromptTokens,
  type UpstreamImageRef,
} from "@/lib/video-gen/assign-image-roles";
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
  return withNode(req, params, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
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

    // The upstream images this node could send, in traversal order. Mirrors the filter in
    // api/nodes/[id]/upstream-images — the focus view and the request must be looking at the
    // same set for the roles keyed by node id to mean the same thing on both sides.
    const upstreamImages: UpstreamImageRef[] = [];
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
      upstreamImages.push({ nodeId: node.nodeId, url, type: node.type });
    }

    // Reference ORDER is the prompt's contract: `<IMAGE_REF_N>` was numbered at the video-prompt
    // node, over ITS upstream in ITS order. The traversal above leads with this node's own direct
    // upstream, so an image attached straight here would take slot 0 and shift every token in the
    // prompt onto the wrong picture — silently, in a paid clip.
    const orderedImages = orderImagesForPromptTokens(
      upstreamImages,
      videoPromptUpstream.map((u) => u.nodeId),
    );

    // An attached image IS an input. Unassigned ones default here the same way the focus view
    // defaults them, so the constraint state the client evaluated is the one the request uses —
    // see assign-image-roles.ts for the divergence that made dropping them look like the fix.
    const effectiveRoles = autoAssignImageRoles(orderedImages, imageRoles, {
      supportsStartFrame: config.imageInputs.startFrame,
    });
    const assigned = assignImageRoles(orderedImages, effectiveRoles);
    const { startFrameUrl, referenceUrls } = assigned;
    let { endFrameUrl } = assigned;

    // Cap reference images at the model's declared limit
    const maxRefs = config.imageInputs.maxReferenceImages;
    if (referenceUrls.length > maxRefs) referenceUrls.splice(maxRefs);
    // If model doesn't support end frame, clear it
    if (!config.imageInputs.endFrame) endFrameUrl = undefined;

    // D97: reject rather than correct. The UI evaluates these same rules and should never let an
    // illegal combination reach here — this is the backstop for callers that bypass it, which is
    // how 13 Veo generations were spent on references at duration 4 or 6.
    //
    // Placed after the capping above on purpose: the state here is stricter than the client's,
    // counting references that actually resolved to URLs and survived the model's limit, not
    // roles that were merely assigned. Placed before insertGeneration and reserveCredits so a
    // rejected request neither records a generation nor touches the org's credit balance.
    const violation = validateAgainstRules(videoGenClientModelMap[modelId]?.rules, {
      params: resolvedParams,
      hasStartFrame: Boolean(startFrameUrl),
      hasEndFrame: Boolean(endFrameUrl),
      referenceCount: referenceUrls.length,
    });
    if (violation) return apiError(violation, 400);

    const mockMode = body.mock === true;

    // Insert generation record (status: 'running')
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
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

    try {
      const durationSeconds = Number(resolvedParams.seconds ?? resolvedParams.duration ?? 0);
      const audioEnabled = isVideoAudioEnabled(resolvedParams.audio);
      const resolution = asResolutionString(resolvedParams.resolution);
      const estimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
      if (estimate === null) {
        throw new Error(`No cost estimate available for ${modelId} at these params.`);
      }
      const estimatedCredits = usdToFinalCredits(estimate.usd);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }

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
    } catch (e) {
      const message = e instanceof Error ? e.message : "Video generation failed";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
  });
}
