// One image-analysis run for a client (D312, D318): card every image that lacks one, then rewrite
// the active KB's Image Analysis section from all the cards. Called by the image-analysis task.
//
// State always moves and nothing throws: the job ends succeeded or failed with a plain reason,
// and the technical cause goes to the log.
import "server-only";
import { createHash } from "node:crypto";
import { failJob, getJob, listRecentJobs, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listCardImageIds, listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { forEachLimited } from "@/lib/for-each-limited";
import { imageAnalysisSummaryPrompt } from "@/prompts/image-analysis-summary";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { IMAGE_CARD_CONCURRENCY, IMAGE_CARD_MODEL, IMAGE_CARD_VERSION } from "./constants";
import { readImageCard } from "./read-image";
import { generateStructured } from "./gemini";
import { aggregateCards, buildSummaryInput, ImageSummarySchema, toImageAnalysis } from "./summarize";
import { mergeImageAnalysis } from "./merge";
import { imageAnalysisCopy } from "./messages";
import type { ImageAnalysisInput, ImageAnalysisResult } from "./types";
import { describeError } from "@/lib/describe-error";

/** Rounds of "read what has no card yet": images added mid-read are picked up by the next round. */
const MAX_ROUNDS = 4;
/** Times the section is rebuilt in one run when images are added or deleted while it is written. */
const MAX_PASSES = 3;

/** Identifies the set of cards a section was built from, and how it was built. */
export function cardSetKey(imageIds: string[]): string {
  const how = `${IMAGE_CARD_VERSION}|${imageAnalysisSummaryPrompt.id}@${imageAnalysisSummaryPrompt.version}|${imageAnalysisSummaryPrompt.model}`;
  return createHash("sha1").update(`${how}|${[...imageIds].sort().join(",")}`).digest("hex");
}

const hasContent = (section: TraceableBrandKB["image_analysis"] | undefined) =>
  Boolean(section && Object.values(section).some((f) => f.value !== null));

export async function runImageAnalysis(jobId: string): Promise<ImageAnalysisResult | null> {
  const job = await getJob<ImageAnalysisInput>(jobId);
  if (!job?.client_id) return null;
  const clientId = job.client_id;

  try {
    await startJob(jobId, imageAnalysisCopy.starting);
    let read = 0;
    let failed = 0;
    let firstFailure: string | null = null;
    // The key the last written section was built from: unchanged cards need no new summary,
    // unless someone asked for a fresh one.
    let lastKey = job.input?.force ? null : await lastWrittenKey(clientId, jobId);
    let result: ImageAnalysisResult = { read: 0, failed: 0, counted: 0, bySource: { upload: 0, website: 0, instagram: 0, facebook: 0 }, written: false };

    for (let pass = 0; pass < MAX_PASSES; pass++) {
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

      const entries = await listImageCards(clientId, IMAGE_CARD_VERSION);
      const stats = aggregateCards(entries);
      const key = cardSetKey(entries.map((e) => e.imageId));
      // cardSetKey is recorded only when the active section is known to be built from this set.
      result = { read, failed, counted: stats.counted, bySource: stats.bySource, written: result.written, cardSetKey: result.cardSetKey };

      // Before the KB is first built there is no version to write to; the build starts a run.
      const before = await getActiveKBVersion(clientId);
      const current = (before?.output as TraceableBrandKB | undefined)?.image_analysis;
      if (!before || stats.counted === 0) break;
      if (key === lastKey && hasContent(current)) {
        result.cardSetKey = key;
        break;
      }

      await setJobPhase(jobId, imageAnalysisCopy.writing);
      const summary = await generateStructured({
        model: imageAnalysisSummaryPrompt.model,
        system: imageAnalysisSummaryPrompt.system,
        parts: [{ text: buildSummaryInput(stats, entries) }],
        schema: ImageSummarySchema,
      });
      // The summary takes a while: write to whichever version is active now (a re-extract may
      // have made a new one), over the reviews it holds now.
      const active = (await getActiveKBVersion(clientId)) ?? before;
      const reviewed = (active.output as TraceableBrandKB | undefined)?.image_analysis;
      await setKBImageAnalysis(active.id, mergeImageAnalysis(reviewed, toImageAnalysis(stats, summary)));
      result.written = true;
      result.cardSetKey = key;
      lastKey = key;

      // Images added or deleted while the section was written: build it again from the new set.
      const [now, todo] = await Promise.all([listCardImageIds(clientId, IMAGE_CARD_VERSION), listImagesNeedingCards(clientId, IMAGE_CARD_VERSION)]);
      if (todo.length === 0 && cardSetKey(now) === key) break;
    }
    if (failed > 0) console.error("[image-analysis] images not read", { jobId, failed, first: firstFailure });

    await succeedJob(jobId, result, result.written ? imageAnalysisCopy.done(result.counted) : imageAnalysisCopy.upToDate(result.counted));
    return result;
  } catch (e) {
    console.error("[image-analysis] failed", { jobId, error: describeError(e) });
    await failJob(jobId, imageAnalysisCopy.failed);
    return null;
  }
}

/** The card-set key of the client's last run that wrote the section, or null. */
async function lastWrittenKey(clientId: string, currentJobId: string): Promise<string | null> {
  const jobs = await listRecentJobs<ImageAnalysisInput, ImageAnalysisResult>(clientId, "image-analysis", 10);
  const last = jobs.find((j) => j.id !== currentJobId && j.status === "succeeded" && j.result?.cardSetKey);
  return last?.result?.cardSetKey ?? null;
}
