// One image-analysis run for a client (D312): card every image that lacks one, then rewrite the
// active KB's Image Analysis section from all the cards. Called by the image-analysis task.
//
// State always moves and nothing throws: the job ends succeeded or failed with a plain reason,
// and the technical cause goes to the log.
import "server-only";
import { failJob, getJob, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { forEachLimited } from "@/lib/for-each-limited";
import { imageAnalysisSummaryPrompt } from "@/prompts/image-analysis-summary";
import { IMAGE_CARD_CONCURRENCY, IMAGE_CARD_MODEL, IMAGE_CARD_VERSION } from "./constants";
import { readImageCard } from "./read-image";
import { generateStructured } from "./gemini";
import { aggregateCards, buildSummaryInput, ImageSummarySchema, toImageAnalysis } from "./summarize";
import { imageAnalysisCopy } from "./messages";
import type { ImageAnalysisResult } from "./types";
import { describeError } from "@/lib/describe-error";

/** Rounds of "read what has no card yet" — images added mid-run are picked up by the next round. */
const MAX_ROUNDS = 4;

export async function runImageAnalysis(jobId: string): Promise<ImageAnalysisResult | null> {
  const job = await getJob(jobId);
  if (!job?.client_id) return null;
  const clientId = job.client_id;

  try {
    await startJob(jobId, imageAnalysisCopy.starting);
    let read = 0;
    let failed = 0;
    let firstFailure: string | null = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const todo = await listImagesNeedingCards(clientId, IMAGE_CARD_VERSION);
      if (todo.length === 0) break;
      await setJobPhase(jobId, imageAnalysisCopy.reading(todo.length));
      let readThisRound = 0;
      await forEachLimited(todo, IMAGE_CARD_CONCURRENCY, async (image) => {
        try {
          const card = await readImageCard(image);
          await upsertImageCard({ imageId: image.id, clientId, version: IMAGE_CARD_VERSION, model: IMAGE_CARD_MODEL, card });
          read++;
          readThisRound++;
        } catch (e) {
          failed++;
          firstFailure ??= `${image.id}: ${describeError(e)}`;
        }
      });
      // Nothing could be read this round: stop rather than retry the same failures.
      if (readThisRound === 0) break;
    }
    if (failed > 0) console.error("[image-analysis] images not read", { jobId, failed, first: firstFailure });

    const entries = await listImageCards(clientId, IMAGE_CARD_VERSION);
    const stats = aggregateCards(entries);
    const result: ImageAnalysisResult = { read, failed, counted: stats.counted, bySource: stats.bySource, written: false };

    // The section lives on the active KB version; before the KB is first built there is none, and
    // the build itself starts another run once it lands.
    const active = await getActiveKBVersion(clientId);
    if (active && stats.counted > 0) {
      await setJobPhase(jobId, imageAnalysisCopy.writing);
      const summary = await generateStructured({
        model: imageAnalysisSummaryPrompt.model,
        system: imageAnalysisSummaryPrompt.system,
        parts: [{ text: buildSummaryInput(stats, entries) }],
        schema: ImageSummarySchema,
      });
      await setKBImageAnalysis(active.id, toImageAnalysis(stats, summary));
      result.written = true;
    }

    await succeedJob(jobId, result, imageAnalysisCopy.done(stats.counted));
    return result;
  } catch (e) {
    console.error("[image-analysis] failed", { jobId, error: describeError(e) });
    await failJob(jobId, imageAnalysisCopy.failed);
    return null;
  }
}
