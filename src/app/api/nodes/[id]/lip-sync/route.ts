import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { signLipSyncedUpload } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import { lipSyncCredits } from "@/lib/dubbing/cost";
import { LIP_SYNC_ENGINE } from "@/lib/dubbing/providers";
import { DUBBING_NOT_SET_UP_MESSAGE } from "@/lib/dubbing/copy";
import { readDubbingOutput, type LipSyncRecord } from "@/lib/dubbing/types";

const BodySchema = z.object({ versionId: z.string().min(1) });

// D375 — lip-sync the active dub. Its result overrides that version's lipSynced stage.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    if (node.type !== "dubbing") return apiError("Node not found.", 404);
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Pick a dub to lip-sync.", 400);
    const { versionId } = parsed.data;
    if (!process.env.FAL_KEY) return apiError(DUBBING_NOT_SET_UP_MESSAGE, 400);
    if (node.active_version_id !== versionId) return apiError("Lip sync runs on the dub you're viewing. Reopen the node and try again.", 400);

    const [version, running] = await Promise.all([getVersionById(versionId), hasRunningGeneration(nodeId)]);
    if (running) return apiError("This node is already working. Try again when it finishes.", 409);
    const output = version && version.node_id === nodeId ? readDubbingOutput(version.output) : null;
    const durationSeconds = version ? durationOfParams(version.params_used ?? {}) : 0;
    if (!output || !durationSeconds) return apiError("Make a dub first, then lip-sync it.", 400);

    const lipSync: LipSyncRecord = { versionId, provider: LIP_SYNC_ENGINE.provider, model: LIP_SYNC_ENGINE.model, runs: 0 };
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "lipsync",
      modelUsed: LIP_SYNC_ENGINE.modelUsed,
      paramsSnapshot: { durationSeconds },
      inputsSnapshot: { lipSync },
    });

    try {
      const reservation = await reserveCredits(effectiveOrgId, generation.id, lipSyncCredits(durationSeconds));
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
      const upload = await signLipSyncedUpload({ nodeId, generationId: generation.id });
      await tasks.trigger("video-lip-sync", {
        generationId: generation.id,
        videoUrl: output.original,
        audioUrl: output.dubbedAudio,
        model: LIP_SYNC_ENGINE.model,
        lipSyncedPutUrl: upload.putUrl,
        lipSyncedUrl: upload.url,
        durationSeconds,
      });
      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const limit = e instanceof CreditLimitError;
      const message = limit ? (e as Error).message : "Couldn't start lip sync. Try again.";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, limit ? 402 : 500);
    }
  });
}
