import "server-only";
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";
import {
  updateKBJobPhase,
  markKBJobSucceeded,
  markKBJobFailed,
  getKBJob,
} from "@/lib/db/kb-jobs";
import { getActiveKBVersion, insertKBDocument, insertKBVersion, setActiveKBVersion } from "@/lib/db/kb";
import { getClientById, setKBStatus } from "@/lib/db/clients";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";
import { uploadKBDocument } from "@/lib/storage";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { KB_JOB_NON_TERMINAL_STATUSES, WEBSITE_RESEARCH_FILENAME } from "@/lib/kb/constants";
import { insertCopilotMessages, type NewCopilotMessage } from "@/lib/db/copilot-messages";
import { buildFailedMessage, buildSucceededMessage } from "@/lib/journey/kb-copilot/build-messages";
import { reviewAccount, reviewFields } from "@/lib/journey/kb-copilot/review";
import { walkMessages } from "@/lib/journey/kb-copilot/walk";
import { withAnswers } from "@/lib/journey/kb-copilot/answers";
import { renderKbText } from "@/lib/scripts/copilot/prompt-context";
import { ONBOARDING } from "@/lib/journey/thread/schema";

const NON_TERMINAL = KB_JOB_NON_TERMINAL_STATUSES;

/** The build tells the copilot thread how it ended (copilot journey, brand KB spec §2.2). Best effort:
 *  a thread message that cannot be stored must never fail the webhook or the build. */
async function tellThread(clientId: string, messages: NewCopilotMessage[]): Promise<void> {
  try {
    await insertCopilotMessages(clientId, ONBOARDING, null, messages);
  } catch (e) {
    console.error("[webhooks/kb-build] could not write to the copilot thread", e);
  }
}

type PhasePayload = {
  jobId: string;
  kind: "phase";
  status: "researching" | "extracting" | "finalizing";
  message: string;
};

type SucceededPayload = {
  jobId: string;
  kind: "succeeded";
  researchMarkdown: string | null;
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
  skippedDocs?: { filename: string; reason: string }[];
};

type FailedPayload = {
  jobId: string;
  kind: "failed";
  error: string;
};

type Payload = PhasePayload | SucceededPayload | FailedPayload;

export async function POST(req: Request) {
  if (!isAuthorizedWebhook(req)) return apiError("Unauthorized.", 401);

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }
  if (!body?.jobId || !body?.kind) return apiError("Missing jobId or kind.", 400);

  // D79: same backstop as the generation webhook — the job's recorded org must still
  // match its client's current org. Checked for every kind, not just "succeeded".
  const jobForCheck = await getKBJob(body.jobId);
  if (!jobForCheck) return apiError("Job not found.", 404);
  const clientForCheck = await getClientById(jobForCheck.client_id);
  if (!clientForCheck || clientForCheck.org_id !== jobForCheck.org_id) {
    console.error("[webhooks/kb-build] org mismatch — dropping", {
      jobId: body.jobId,
      recordedOrgId: jobForCheck.org_id,
      currentOrgId: clientForCheck?.org_id ?? null,
    });
    return apiOk({ ok: true, dropped: "org mismatch" });
  }

  try {
    if (body.kind === "phase") {
      await updateKBJobPhase({
        jobId: body.jobId,
        status: body.status,
        phaseMessage: body.message,
      });
      return apiOk({ ok: true });
    }

    if (body.kind === "failed") {
      await markKBJobFailed({ jobId: body.jobId, error: body.error });
      // Said once: a repeated delivery finds the job already finished.
      if (NON_TERMINAL.includes(jobForCheck.status)) {
        // A failed build writes nothing. The copilot only accepts "start the build" while no KB exists.
        await tellThread(jobForCheck.client_id, [buildFailedMessage(body.error, { canRetry: !clientForCheck.active_kb_version_id, unchanged: true })]);
      }
      return apiOk({ ok: true });
    }

    // kind === "succeeded" — terminal: do all the graduation writes.
    const job = jobForCheck;
    if (!NON_TERMINAL.includes(job.status)) {
      // Already terminal — idempotent no-op.
      return apiOk({ ok: true, alreadyTerminal: true });
    }

    const docIdsForVersion = [...(job.doc_ids_used ?? [])];

    // The first question, and likely answers for it when it is about an empty field (D533). Started
    // now, beside the saves below, so the thread is not held up waiting for them (review fix). A KB
    // this cannot read is announced without a question (step 5); failed answers leave the question plain.
    let firstQuestions: { fields: ReturnType<typeof reviewFields>; answered: Promise<NewCopilotMessage[]> } | null = null;
    try {
      const fields = reviewFields(body.kbOutput);
      const questions = walkMessages({ fields, walk: { asked: [], pending: null }, turn: null });
      const answered = (async () => withAnswers(questions, fields, renderKbText(body.kbOutput as TraceableBrandKB)))().catch((e) => {
        console.error("[webhooks/kb-build] could not suggest answers", e);
        return questions;
      });
      firstQuestions = { fields, answered };
    } catch (e) {
      console.error("[webhooks/kb-build] could not count the KB for the copilot thread", e);
    }

    // 1. Persist research Markdown as a kb document, if any.
    if (body.researchMarkdown) {
      const researchDocId = crypto.randomUUID();
      const mdBuffer = Buffer.from(body.researchMarkdown, "utf-8");
      const { url } = await uploadKBDocument({
        clientId: job.client_id,
        docId: researchDocId,
        filename: WEBSITE_RESEARCH_FILENAME,
        body: mdBuffer,
        contentType: "text/markdown",
      });
      const researchDoc = await insertKBDocument({
        clientId: job.client_id,
        filename: WEBSITE_RESEARCH_FILENAME,
        fileExt: "md",
        storageUrl: url,
        sizeBytes: mdBuffer.byteLength,
      });
      docIdsForVersion.push(researchDoc.id);
    }

    // 2. Insert the KB version + set active + flip kb_status. The build leaves Image Analysis empty;
    // on a rebuild the client already has one, so it is carried over, reviews included (D318).
    const previous = (await getActiveKBVersion(job.client_id))?.output as TraceableBrandKB | undefined;
    const version = await insertKBVersion({
      clientId: job.client_id,
      output: previous?.image_analysis ? { ...body.kbOutput, image_analysis: previous.image_analysis } : body.kbOutput,
      modelUsed: body.modelUsed,
      docIdsUsed: docIdsForVersion,
      fillRate: body.fillRate,
    });
    await setActiveKBVersion(job.client_id, version.id);
    await setKBStatus(job.client_id, "in_review");

    // 3. Mark the job succeeded.
    await markKBJobSucceeded({ jobId: body.jobId, versionId: version.id });

    // 4. This run fills Image Analysis from every brand image, or leaves a current one alone (D312).
    await startImageAnalysisQuietly(job.client_id);

    // 5. Say so in the copilot thread, with what it found, and ask the first question about what it
    //    could not settle (spec §2.3). Counted from the KB in hand: nothing more is read. The panel
    //    picks it up on its next check.
    const built = {
      hadWebsite: job.website_url !== null,
      // The ones it read: what it skipped is named in the message instead.
      documentCount: Math.max(0, (job.doc_ids_used ?? []).length - (body.skippedDocs ?? []).length),
      skipped: body.skippedDocs ?? [],
    };
    // The KB is saved by now. A KB that could not be counted is still announced, never failed.
    const landed: NewCopilotMessage[] = firstQuestions
      ? [buildSucceededMessage({ ...built, account: reviewAccount(firstQuestions.fields) }), ...(await firstQuestions.answered)]
      : [buildSucceededMessage(built)];
    await tellThread(job.client_id, landed);

    return apiOk({ ok: true, versionId: version.id });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Webhook failed.";
    // Best-effort: mark the job failed so the UI escapes the running state.
    try { await markKBJobFailed({ jobId: body.jobId, error }); } catch {}
    // This failed part-way through the writes above, so it cannot say that nothing changed.
    if (NON_TERMINAL.includes(jobForCheck.status)) await tellThread(jobForCheck.client_id, [buildFailedMessage(error, { canRetry: false, unchanged: false })]);
    return apiError(error, 500);
  }
}
