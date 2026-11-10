import { scriptAssetIds } from "@/lib/scripts/asset-nodes";
import { planCitedRefIds, renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import { imageRefDialect } from "@/lib/nodes/prompt-token-dialect";
import { multishotVoiceover } from "@/lib/nodes/voiceover";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { mapUpstreamForVideo } from "@/lib/nodes/resolve-inputs";
import {
  citedRefIds,
  refEntriesOf,
  renderRefs,
  singleTakeRefDialect,
  singleTakeTargetForProvider,
} from "@/lib/nodes/ref-binding";
import { videoGenClientModelMap, usableVideoModelId } from "@/lib/video-gen/client-models";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { collectConnectedUpstream } from "@/lib/video-gen/connected-images";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node) => {
    try {
      const { direct, promptNodes, promptUpstreamBatches, images } = await collectConnectedUpstream(nodeId, node.type);

      // Surface the connected prompt node so the focus view can display its motion prompt text —
      // a video-prompt node's string output directly, or a multishot-prompt node's MultishotPlan
      // rendered against its own upstream Multishot node's cuts (same renderPlan the money path
      // uses in resolve-prompt.ts). Never the raw object — that would print "[object Object]".
      const connectedPromptNode = direct.find(
        (u) => u.type === "video-prompt" || u.type === "multishot-prompt",
      );
      const promptNodeIndex = connectedPromptNode ? promptNodes.indexOf(connectedPromptNode) : -1;

      // BUG-010 — this is the preview of what will be SENT, so stored image ids are rendered to
      // the model's positions exactly as resolve-prompt.ts does on the money path: over the prompt
      // node's own references, in the writer's order.
      const ownUpstream = promptNodeIndex >= 0 ? promptUpstreamBatches[promptNodeIndex] : [];
      const refIds = refEntriesOf(ownUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id);

      let promptText: string | null = null;
      // D308 — what Video Gen needs to show which references go: the images the prompt cites
      // (second in priority) and the avatar's front and sheet, as the route will see them.
      let citedIds: string[] = [];
      if (connectedPromptNode?.type === "video-prompt") {
        const stored =
          typeof connectedPromptNode.activeOutput === "string" ? connectedPromptNode.activeOutput : null;
        // D461 — the stored row can still name a deprecated model the canvas has moved off.
        const modelId = usableVideoModelId(
          typeof node.data?.modelId === "string" ? node.data.modelId : "",
        );
        const dialect = singleTakeRefDialect(
          singleTakeTargetForProvider(videoGenClientModelMap[modelId]?.provider),
          refIds,
        );
        promptText = stored !== null && dialect ? renderRefs(stored, dialect).text : stored;
        if (stored !== null) citedIds = citedRefIds(stored, dialect ?? imageRefDialect(refIds));
      } else if (connectedPromptNode?.type === "multishot-prompt") {
        const plan = connectedPromptNode.activeOutput as MultishotPlan | null | undefined;
        const multishotNode = ownUpstream.find((u) => u.type === "multishot");
        const cuts = ((multishotNode?.data.cuts as MultishotCut[] | undefined) ?? []).filter(
          (c) => c && c.id && typeof c.text === "string" && typeof c.seconds === "number",
        );
        if (plan && typeof plan === "object" && Array.isArray(plan.beats) && cuts.length > 0) {
          // Rendered in the TARGET MODEL's own format (D238), read off THE PLAN's own stamp
          // (D236) — the same value resolve-prompt.ts reads on the money path, and deliberately
          // not the Multishot node's current `targetModel`. This is the preview the focus view
          // shows as "what will be sent", so reading the node would show the operator a prompt in
          // whichever format the Select happens to say right now rather than the one the money
          // path will actually build. An unstamped plan is Gemini Omni's, which is what every plan
          // predating the stamp already is.
          promptText = renderPlan(
            plan,
            cuts,
            multishotCapabilityFor(plan.targetModel),
            refIds,
            multishotNode ? multishotVoiceover(multishotNode.data) : undefined,
          );
          citedIds = [...planCitedRefIds(plan, multishotCapabilityFor(plan.targetModel), refIds)];
        }
      }

      const promptNode = connectedPromptNode
        ? {
            id: connectedPromptNode.nodeId,
            type: connectedPromptNode.type,
            text: promptText,
            citedIds,
            avatarFrontId: ownUpstream.find((u) => u.data.presenter === true)?.nodeId ?? null,
            avatarSheetId: ownUpstream.find((u) => u.data.presenter === "sheet")?.nodeId ?? null,
            // D450 — the same asset ranking the request applies.
            ...(() => {
              const ids = scriptAssetIds([...direct, ...ownUpstream]);
              return { assetMainIds: ids.main, assetAngleIds: ids.angles, storyboardIds: ids.storyboard };
            })(),
          }
        : null;

      return apiOk({ images, promptNode });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to resolve upstream images";
      return apiError(message, 500);
    }
  });
}
