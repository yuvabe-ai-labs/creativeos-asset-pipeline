// One image-analysis run for a client (D312, D318): card every image that lacks one, then rewrite
// the active KB's Image Analysis section from all the cards. Called by the image-analysis task.
//
// State always moves and nothing throws: the job ends succeeded or failed with a plain reason,
// and the technical cause goes to the log.
import "server-only";
import { createHash } from "node:crypto";
import { failJob, getJob, listRecentJobs, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { listCardImageIds, listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { forEachLimited } from "@/lib/for-each-limited";
import { imageAnalysisSummaryPrompt } from "@/prompts/image-analysis-summary";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { IMAGE_CARD_CONCURRENCY, IMAGE_CARD_MODEL, IMAGE_CARD_VERSION } from "./constants";
import { readImageCard } from "./read-image";
import { generateStructured } from "./gemini";
import { aggregateCards, approvedWords, buildSummaryInput, ImageSummarySchema, toImageAnalysis } from "./summarize";
import { studyImageAnalysis } from "./merge";
import { imageAnalysisCopy } from "./messages";
import type { ImageAnalysisInput, ImageAnalysisResult } from "./types";
import { describeError } from "@/lib/describe-error";
import { claimChangeCard, hasCopilotMessages, insertCopilotMessages, listPendingChangeCards, listSettledChangeCards } from "@/lib/db/copilot-messages";
import { getClientById } from "@/lib/db/clients";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { buildImageStudyCard, isImageStudyCard } from "@/lib/kb/changes/card";
import { imageStudyCopy } from "@/lib/kb/changes/copy";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import { changedImageFields, imageAnalysisNote } from "./change-note";

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
  // D560 — the job row says whose run it is: each Gemini call's cost is recorded for them.
  const recordFor = { orgId: job.org_id, clientId, userId: job.created_by };

  try {
    await startJob(jobId, imageAnalysisCopy.starting);
    let read = 0;
    let failed = 0;
    let firstFailure: string | null = null;
    // The key the last written section was built from: unchanged cards need no new summary,
    // unless someone asked for a fresh one.
    let lastKey = job.input?.force ? null : await lastWrittenKey(clientId, jobId);
    // Fields a re-study changed in a section that already had content, for the copilot to say.
    const changed = new Set<string>();
    // What the last pass that wrote would change in reviewed fields; null when nothing was written.
    let proposed: Proposed | null = null;
    let result: ImageAnalysisResult = { read: 0, failed: 0, counted: 0, bySource: { upload: 0, website: 0, instagram: 0, facebook: 0 }, written: false };

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const todo = await listImagesNeedingCards(clientId, IMAGE_CARD_VERSION);
        if (todo.length === 0) break;
        await setJobPhase(jobId, imageAnalysisCopy.reading(todo.length));
        let readThisRound = 0;
        await forEachLimited(todo, IMAGE_CARD_CONCURRENCY, async (image) => {
          try {
            const card = await readImageCard(image, { recordFor });
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
        // The model is shown what the team approved, so a study that reads the same keeps those words.
        parts: [{ text: buildSummaryInput(stats, entries, approvedWords(current)) }],
        schema: ImageSummarySchema,
        recordFor,
      });
      // Before anything is written: an earlier study's card still waiting is an older reading of the
      // images, and must not be approvable once this study has moved the section on (review fix).
      await retireEarlierCards(clientId);
      // The summary takes a while: write to whichever version is active now (a re-extract may
      // have made a new one), over the reviews it holds now.
      const active = (await getActiveKBVersion(clientId)) ?? before;
      const reviewed = (active.output as TraceableBrandKB | undefined)?.image_analysis;
      // A field the team has reviewed is never replaced: the study keeps it and proposes its new
      // reading on a change card instead (piece 2b). Everything else is written, as before.
      const { section: merged, proposals } = studyImageAnalysis(reviewed, toImageAnalysis(stats, summary));
      await setKBImageAnalysis(active.id, merged);
      if (reviewed && hasContent(reviewed)) for (const label of changedImageFields(reviewed, merged)) changed.add(label);
      // The last pass is the one that stands: its proposals, against the version it wrote to.
      proposed = { versionId: active.id, proposals };
      result.written = true;
      result.cardSetKey = key;
      lastKey = key;

      // Images added or deleted while the section was written: build it again from the new set.
      const [now, todo] = await Promise.all([listCardImageIds(clientId, IMAGE_CARD_VERSION), listImagesNeedingCards(clientId, IMAGE_CARD_VERSION)]);
      if (todo.length === 0 && cardSetKey(now) === key) break;
    }
    if (failed > 0) console.error("[image-analysis] images not read", { jobId, failed, first: firstFailure });
    await sayWhatChanged(clientId, [...changed]);
    if (proposed) await proposeChanges(clientId, proposed);

    await succeedJob(jobId, result, result.written ? imageAnalysisCopy.done(result.counted) : imageAnalysisCopy.upToDate(result.counted));
    return result;
  } catch (e) {
    console.error("[image-analysis] failed", { jobId, error: describeError(e) });
    await failJob(jobId, imageAnalysisCopy.failed);
    // Said once in the client's copilot thread (D518).
    await sayJobFailed({ client_id: clientId, kind: "image-analysis", input: job.input });
    return null;
  }
}

/** What a study that wrote would change in fields the team has reviewed. */
type Proposed = { versionId: string; proposals: { key: string; value: unknown }[] };

/** Marks every image-study card still waiting as out of date. Best effort: a failure never fails the run. */
async function retireEarlierCards(clientId: string): Promise<void> {
  try {
    for (const { id, card } of await listPendingChangeCards(clientId)) {
      if (isImageStudyCard(card)) await claimChangeCard(clientId, id, { ...card, status: "stale" });
    }
  } catch (e) {
    console.error("[image-analysis] could not write the change card", { clientId, error: describeError(e) });
  }
}

/** Puts what a study would change in reviewed fields on a change card in the client's copilot thread
 *  (piece 2b). The card is made against what is stored at this moment, not what the study read
 *  earlier, so its "before" is never out of date the moment it appears. Best effort: what the study
 *  wrote stands, and a failure here never fails the run. */
async function proposeChanges(clientId: string, proposed: Proposed): Promise<void> {
  if (proposed.proposals.length === 0) return;
  try {
    const [now, settled] = await Promise.all([getActiveKBVersion(clientId), listSettledChangeCards(clientId)]);
    // Rebuilt while the study ran: its proposals were for a brand KB no longer in use.
    if (!now || now.id !== proposed.versionId) return;
    const card = buildImageStudyCard({ ...proposed, current: now.output as TraceableBrandKB, settled });
    if (!card) return;
    const client = await getClientById(clientId);
    if (!client) return;
    await ensureOpening(client);
    await insertCopilotMessages(clientId, ONBOARDING, null, [{ role: "assistant", content: imageStudyCopy.card(card.fields.length), card, suggestions: [] }]);
  } catch (e) {
    console.error("[image-analysis] could not write the change card", { clientId, error: describeError(e) });
  }
}

/** Says in the client's copilot thread which Image Analysis fields a re-study changed. Best effort:
 *  a client with no thread yet gets nothing, and a failure never fails the run. */
async function sayWhatChanged(clientId: string, labels: string[]): Promise<void> {
  const note = imageAnalysisNote(labels);
  if (!note) return;
  try {
    if (!(await hasCopilotMessages(clientId, ONBOARDING))) return;
    await insertCopilotMessages(clientId, ONBOARDING, null, [{ role: "assistant", content: note, card: { kind: "note" }, suggestions: [] }]);
  } catch (e) {
    console.error("[image-analysis] could not say what changed", { clientId, error: describeError(e) });
  }
}

async function lastWrittenKey(clientId: string, currentJobId: string): Promise<string | null> {
  const jobs = await listRecentJobs<ImageAnalysisInput, ImageAnalysisResult>(clientId, "image-analysis", 10);
  const last = jobs.find((j) => j.id !== currentJobId && j.status === "succeeded" && j.result?.cardSetKey);
  return last?.result?.cardSetKey ?? null;
}
