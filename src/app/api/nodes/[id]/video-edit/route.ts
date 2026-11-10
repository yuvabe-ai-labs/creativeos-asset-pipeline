import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { editorLockResponse } from "@/lib/editor/lock-guard";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { isOwnStoredUrl } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { GEMINI_OMNI_12_IMAGE_INPUTS } from "@/lib/video-gen/gemini-omni-shape";
import { collectConnectedUpstream } from "@/lib/video-gen/connected-images";
import { composeVideoEditPrompt } from "@/lib/video-edit/prompt";
import {
  VIDEO_EDIT_MAX_SECONDS,
  VIDEO_EDIT_RESOLUTIONS,
  VIDEO_EDIT_TOO_LONG_MESSAGE,
  readVideoEdit,
  videoEditEstimateCredits,
  type VideoEditRecord,
} from "@/lib/video-edit/record";

const BodySchema = z.object({
  baseVersionId: z.string().min(1),
  instruction: z.string().trim().min(1).max(2000),
  referenceNodeIds: z.array(z.string().min(1)),
  resolution: z.enum(VIDEO_EDIT_RESOLUTIONS),
  mock: z.boolean().optional(),
});

const START_FAILED = "Couldn't start the edit. Try again.";

// D483 — edit a finished take with Gemini Omni. Runs as a `video` generation on the existing
// video-generate task; completeGeneration appends the version and settles credits.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, (nodeId, node, caller, clientId, effectiveOrgId) => {
    return withTryCatch(START_FAILED, async () => {
      if (node.type !== "video-gen") return apiError("Node not found.", 404);
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Describe the change and pick a resolution.", 400);
      const { baseVersionId, instruction, resolution, mock } = parsed.data;
      const referenceNodeIds = [...new Set(parsed.data.referenceNodeIds)];
      const cap = GEMINI_OMNI_12_IMAGE_INPUTS.maxReferenceImages;
      if (referenceNodeIds.length > cap) return apiError(`Pick up to ${cap} references.`, 400);
      if (!process.env.GOOGLE_GENAI_API_KEY) return apiError("Video editing isn't set up yet.", 400);

      // D390 — an edit makes a new take: refused while the clip is in the Editor's reel.
      const [locked, base, running, connected] = await Promise.all([
        editorLockResponse(nodeId),
        getVersionById(baseVersionId),
        hasRunningGeneration(nodeId),
        collectConnectedUpstream(nodeId, node.type),
      ]);
      if (locked) return locked;
      if (running) return apiError("This node is already working. Try again when it finishes.", 409);
      if (!base || base.node_id !== nodeId) return apiError("That version isn't on this node.", 400);
      if (base.error || typeof base.output !== "string" || !isOwnStoredUrl(base.output)) {
        return apiError("Pick a finished take to edit.", 400);
      }
      const durationSeconds = durationOfParams(base.params_used ?? {});
      if (!durationSeconds) return apiError("This take has no recorded length, so it can't be priced.", 400);
      if (durationSeconds > VIDEO_EDIT_MAX_SECONDS) return apiError(VIDEO_EDIT_TOO_LONG_MESSAGE, 400);

      // Rule 14 — every reference must be an image connected to this node.
      const byId = new Map(connected.images.map((img) => [img.id, img]));
      const refs = referenceNodeIds.map((id) => byId.get(id));
      if (refs.some((r) => !r)) return apiError("One of the references is no longer connected. Reopen the node and try again.", 400);
      const references = refs as NonNullable<(typeof refs)[number]>[];

      const editPrompt = composeVideoEditPrompt({
        instruction,
        references: references.map((r) => ({ label: r.filename ?? "a reference image" })),
      });
      const referenceUrls = references.map((r) => r.imageUrl);
      const videoEdit: VideoEditRecord = {
        baseVersionId,
        rootVersionId: readVideoEdit(base.inputs_used?.videoEdit)?.rootVersionId ?? base.id,
        instruction,
        editPrompt,
        referenceNodeIds,
        referenceUrls,
        resolution,
      };
      const editParams = { resolution, durationSeconds };
      const generation = await insertGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "video",
        modelUsed: GEMINI_OMNI_MODEL_ID,
        paramsSnapshot: editParams,
        inputsSnapshot: { prompt: editPrompt, referenceUrls, videoEdit },
      });

      try {
        const reservation = await reserveCredits(effectiveOrgId, generation.id, videoEditEstimateCredits(durationSeconds, resolution));
        if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
        await tasks.trigger("video-generate", {
          generationId: generation.id,
          modelId: GEMINI_OMNI_MODEL_ID,
          prompt: editPrompt,
          referenceUrls,
          params: editParams,
          editVideoUrl: base.output,
          mockMode: mock === true,
        });
        return apiOk({ generationId: generation.id }, 202);
      } catch (e) {
        const limit = e instanceof CreditLimitError;
        const message = limit ? (e as Error).message : START_FAILED;
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
        return apiError(message, limit ? 402 : 500);
      }
    });
  });
}
