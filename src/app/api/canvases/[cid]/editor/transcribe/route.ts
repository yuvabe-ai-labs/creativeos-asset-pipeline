import { tasks } from "@trigger.dev/sdk";
import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { CreditLimitError, refundReservation, reserveCredits } from "@/lib/db/credit-transactions";
import { failGeneration, insertGeneration } from "@/lib/db/generations";
import { listTranscribedUrls } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription, type TranscribeJobInput } from "@/lib/editor/transcribe-plan";
import { findLiveTranscribeJob, settleIfRunDead } from "@/lib/editor/transcribe-recovery-server";
import { failJob, failStaleJobs, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { TRANSCRIBE_ENGINE } from "@/lib/transcribe/providers";

// Starts Auto captions (D395, D399). The files come from the SAVED edit's sources, read fresh here
// (rules 10, 14). Files already transcribed cost nothing and need no job. One run per Editor; the
// task payload is the job id only (rule 8).
const STALE_MS = 15 * 60 * 1000;
const START_FAILED = "Couldn't start captions. Try again.";
const BodySchema = z.object({ nodeId: z.uuid(), pieceIds: z.array(z.string().min(1)).max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId, canvas) =>
    withTryCatch(START_FAILED, async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which clips to caption.", 400);
      const { nodeId, pieceIds } = parsed.data;
      if (!process.env.ELEVEN_LABS_API_KEY) return apiError("Captions aren't set up yet.", 400);

      const [state, orgId, caller] = await Promise.all([loadEditorState(canvasId), resolveOrgId(), resolveCallerContext()]);
      if (!state || state.editorNodeId !== nodeId) return apiError("Editor not found.", 404);

      const { files, noSound } = planTranscription(state.doc, state.sources, pieceIds);
      const done = await listTranscribedUrls(files.map((f) => f.url));
      const fresh = files.filter((f) => !done.has(f.url));
      if (fresh.length === 0) return apiOk({ jobId: null, noSound });

      const seconds = fresh.reduce((s, f) => s + f.seconds, 0);
      const clientId = canvas.client_id;
      await failStaleJobs(clientId, "editor-transcribe", STALE_MS);
      const generation = await insertGeneration({
        nodeId,
        orgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "transcribe",
        modelUsed: TRANSCRIBE_ENGINE.modelUsed,
        paramsSnapshot: { seconds },
        inputsSnapshot: { files: fresh },
      });
      const giveBack = async (message: string) => {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId, generationId: generation.id }).catch(() => null);
      };

      const input: TranscribeJobInput = { canvasId, nodeId, generationId: generation.id, orgId, files: fresh };
      const insert = () => insertJob({ orgId, clientId, kind: "editor-transcribe", input, lockKey: `editor-transcribe:${nodeId}`, phaseMessage: "Listening…" });
      let jobId: string;
      try {
        const reservation = await reserveCredits(orgId, generation.id, transcribeCredits(seconds));
        if (!reservation.ok) throw new CreditLimitError(CREDIT_LIMIT_TOAST_MESSAGE);
        try {
          jobId = (await insert()).id;
        } catch (err) {
          if (!(err instanceof JobLockedError)) throw err;
          // The lock is held. A run that died without reporting is settled and replaced; a run
          // still going is followed instead of refused (the editor polls it).
          const live = await findLiveTranscribeJob(clientId, nodeId);
          if (live && (await settleIfRunDead(live))) {
            jobId = (await insert()).id;
          } else if (live) {
            await giveBack("Already running.");
            return apiOk({ jobId: live.id, noSound }, 202);
          } else {
            throw err;
          }
        }
      } catch (err) {
        if (err instanceof CreditLimitError) {
          await giveBack(CREDIT_LIMIT_TOAST_MESSAGE);
          return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
        }
        if (err instanceof JobLockedError) {
          await giveBack("Already running.");
          return apiError("Captions are already being written for this reel.", 409);
        }
        await giveBack(START_FAILED);
        throw err;
      }

      try {
        const run = await tasks.trigger("editor-transcribe", { jobId });
        await setJobRunId(jobId, run.id);
      } catch {
        await failJob(jobId, START_FAILED);
        await giveBack(START_FAILED);
        return apiError(START_FAILED, 502);
      }
      return apiOk({ jobId, noSound }, 202);
    }),
  );
}
