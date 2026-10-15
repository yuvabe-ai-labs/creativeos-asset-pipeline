import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { signDubbingUploads } from "@/lib/storage";
import { resolveDubSource } from "@/lib/dubbing/source";
import { dubCredits } from "@/lib/dubbing/cost";
import { DUB_ENGINE } from "@/lib/dubbing/providers";
import { DUBBING_NOT_SET_UP_MESSAGE } from "@/lib/dubbing/copy";
import { DUB_SOURCE_LANGUAGE, isDubLanguage, type DubRecord } from "@/lib/dubbing/types";

const BodySchema = z.object({ language: z.string().refine(isDubLanguage) });

// D374 — dub the one connected video's current take. A new `dub` generation; its version is
// written when the task reports back (D375).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, (nodeId, node, caller, clientId, effectiveOrgId) => {
    return withTryCatch("Couldn't start the dub. Try again.", async () => {
      if (node.type !== "dubbing") return apiError("Node not found.", 404);
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success || !isDubLanguage(parsed.data.language)) return apiError("Pick a language to dub into.", 400);
      const targetLang = parsed.data.language;
      if (!process.env.SARVAM_API_KEY) return apiError(DUBBING_NOT_SET_UP_MESSAGE, 400);

      // Independent reads run side by side (performance rule 5).
      const [source, running] = await Promise.all([
        resolveDubSource(nodeId, { getUpstreamOutputs, getVersionById }),
        hasRunningGeneration(nodeId),
      ]);
      if (running) return apiError("This node is already working. Try again when it finishes.", 409);
      if (!source.ok) return apiError(source.reason, 400);

      const dub: DubRecord = {
        sourceNodeId: source.sourceNodeId,
        sourceVersionId: source.sourceVersionId,
        sourceUrl: source.sourceUrl,
        srcLang: DUB_SOURCE_LANGUAGE,
        targetLang,
        durationSeconds: source.durationSeconds,
        provider: DUB_ENGINE.provider,
        model: DUB_ENGINE.model,
      };
      const generation = await insertGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "dub",
        modelUsed: DUB_ENGINE.modelUsed,
        paramsSnapshot: { durationSeconds: source.durationSeconds },
        inputsSnapshot: { dub },
      });

      try {
        const reservation = await reserveCredits(effectiveOrgId, generation.id, dubCredits(source.durationSeconds));
        if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
        const uploads = await signDubbingUploads({ nodeId, generationId: generation.id });
        await tasks.trigger("video-dub", {
          generationId: generation.id,
          sourceUrl: source.sourceUrl,
          targetLang,
          dubbedPutUrl: uploads.dubbed.putUrl,
          dubbedAudioPutUrl: uploads.dubbedAudio.putUrl,
          dubbedUrl: uploads.dubbed.url,
          dubbedAudioUrl: uploads.dubbedAudio.url,
          durationSeconds: source.durationSeconds,
        });
        return apiOk({ generationId: generation.id }, 202);
      } catch (e) {
        const limit = e instanceof CreditLimitError;
        const message = limit ? (e as Error).message : "Couldn't start the dub. Try again.";
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
        return apiError(message, limit ? 402 : 500);
      }
    });
  });
}
