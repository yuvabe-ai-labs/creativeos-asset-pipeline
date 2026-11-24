import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { editorLockResponse } from "@/lib/editor/lock-guard";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { currentPrice } from "@/lib/ai-models/pricing";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { creditSettingsAt } from "@/lib/credits/units";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { nodeModelId } from "@/lib/ai-models/runnable";
import { videoRun } from "@/lib/video-gen/video-run";
import { isOwnStoredUrl } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import { collectConnectedUpstream } from "@/lib/video-gen/connected-images";
import { composeVideoEditPrompt, mentionedImageIds } from "@/lib/video-edit/prompt";
import {
  VIDEO_EDIT_MODEL_IDS,
  VIDEO_EDIT_RESOLUTIONS,
  editOwnModelId,
  firstOfferedEditModel,
  readVideoEdit,
  videoEditEstimateCredits,
  videoEditLimitsFor,
  videoEditTooLongMessage,
  videoEditTooManyReferencesMessage,
  type VideoEditRecord,
} from "@/lib/video-edit/record";

const BodySchema = z.object({
  baseVersionId: z.string().min(1),
  instruction: z.string().trim().min(1).max(2000),
  referenceNodeIds: z.array(z.string().min(1)),
  resolution: z.enum(VIDEO_EDIT_RESOLUTIONS),
  /** Absent: the newest edit model offered on this take (firstOfferedEditModel). */
  modelId: z.enum(VIDEO_EDIT_MODEL_IDS).optional(),
  mock: z.boolean().optional(),
});

const START_FAILED = "Couldn't start the edit. Try again.";

// D483 — edit a finished take with Gemini Omni (1.2 or 1.1, the operator's pick). Runs as an
// `edit` generation on the existing video-generate task; completeGeneration appends the version
// and settles credits. Its own type (like a voice change's `voice`) is what lets the focus view
// keep Edit open and the take on screen while it runs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, (nodeId, node, caller, clientId, effectiveOrgId) => {
    return withTryCatch(START_FAILED, async () => {
      if (node.type !== "video-gen") return apiError("Node not found.", 404);
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Describe the change and pick a resolution.", 400);
      const { baseVersionId, instruction, resolution, mock } = parsed.data;
      const tickedIds = [...new Set(parsed.data.referenceNodeIds)];
      if (!process.env.GOOGLE_GENAI_API_KEY) return apiError("Video editing isn't set up yet.", 400);

      // D390 — an edit makes a new take: refused while the clip is in the Editor's reel.
      const [locked, base, running, connected, catalog] = await Promise.all([
        editorLockResponse(nodeId),
        getVersionById(baseVersionId),
        hasRunningGeneration(nodeId),
        collectConnectedUpstream(nodeId, node.type),
        getAiCatalog(),
      ]);
      if (locked) return locked;
      const videos = videoModelsFrom(catalog);
      // D540 — the edit model goes through the same check as a generation. A hidden edit model
      // keeps running on a take last edited with it; a take never edited falls back to the node's model.
      const editedWith = editOwnModelId(base?.inputs_used, nodeModelId(node.data));
      const modelId = parsed.data.modelId ?? firstOfferedEditModel(videos, editedWith);
      const run = videoRun(catalog, modelId, { existingNodeModelId: editedWith });
      if (!run.ok) return apiError(run.message, 400);
      // The model's limits only once it may run: a locked or refused edit never names them.
      const limits = videoEditLimitsFor(videos, modelId);
      if (tickedIds.length > limits.maxReferences) return apiError(videoEditTooManyReferencesMessage(videos, modelId), 400);
      if (running) return apiError("This node is already working. Try again when it finishes.", 409);
      if (!base || base.node_id !== nodeId) return apiError("That version isn't on this node.", 400);
      if (base.error || typeof base.output !== "string" || !isOwnStoredUrl(base.output)) {
        return apiError("Pick a finished take to edit.", 400);
      }
      const durationSeconds = durationOfParams(base.params_used ?? {});
      if (!durationSeconds) return apiError("This take has no recorded length, so it can't be priced.", 400);
      if (durationSeconds > limits.maxSeconds) return apiError(videoEditTooLongMessage(videos, modelId), 400);

      // Rule 14 — every reference must be an image connected to this node.
      const byId = new Map(connected.images.map((img) => [img.id, img]));
      // An image @-mentioned in the instruction is sent as a reference even if its tile wasn't
      // ticked; a mention of anything that isn't a connected image stays plain text.
      const referenceNodeIds = [...new Set([...tickedIds, ...mentionedImageIds(instruction).filter((id) => byId.has(id))])];
      if (referenceNodeIds.length > limits.maxReferences) return apiError(videoEditTooManyReferencesMessage(videos, modelId), 400);
      const refs = referenceNodeIds.map((id) => byId.get(id));
      if (refs.some((r) => !r)) return apiError("One of the references is no longer connected. Reopen the node and try again.", 400);
      const references = refs as NonNullable<(typeof refs)[number]>[];

      const editPrompt = composeVideoEditPrompt({
        instruction,
        references: references.map((r) => ({ id: r.id, label: r.filename ?? "a reference image" })),
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
        modelId,
      };
      const editParams = { resolution, durationSeconds };
      const price = currentPrice(catalog, modelId, new Date());
      if (!price) return apiError(NO_PRICE_MESSAGE, 409);
      const generation = await insertGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "edit",
        modelUsed: modelId,
        modelPriceId: price.id,
        paramsSnapshot: editParams,
        inputsSnapshot: { prompt: editPrompt, referenceUrls, videoEdit },
      });

      try {
        const credits = videoEditEstimateCredits(price, durationSeconds, resolution, referenceUrls.length, creditSettingsAt(catalog, new Date(generation.created_at)));
        if (credits === null) throw new Error(`No price for ${modelId} at ${resolution}.`);
        const reservation = await reserveCredits(effectiveOrgId, generation.id, credits);
        if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
        await tasks.trigger("video-generate", {
          generationId: generation.id,
          modelId,
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
