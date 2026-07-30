import "server-only";
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";
import {
  updateKBJobPhase,
  markKBJobSucceeded,
  markKBJobFailed,
  getKBJob,
} from "@/lib/db/kb-jobs";
import { insertKBDocument, insertKBVersion, setActiveKBVersion } from "@/lib/db/kb";
import { getClientById, setKBStatus } from "@/lib/db/clients";
import { uploadKBDocument } from "@/lib/storage";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { KB_JOB_NON_TERMINAL_STATUSES } from "@/lib/kb/constants";

const NON_TERMINAL = KB_JOB_NON_TERMINAL_STATUSES;

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
      return apiOk({ ok: true });
    }

    // kind === "succeeded" — terminal: do all the graduation writes.
    const job = jobForCheck;
    if (!NON_TERMINAL.includes(job.status)) {
      // Already terminal — idempotent no-op.
      return apiOk({ ok: true, alreadyTerminal: true });
    }

    const docIdsForVersion = [...(job.doc_ids_used ?? [])];

    // 1. Persist research Markdown as a kb document, if any.
    if (body.researchMarkdown) {
      const researchDocId = crypto.randomUUID();
      const mdBuffer = Buffer.from(body.researchMarkdown, "utf-8");
      const { url } = await uploadKBDocument({
        clientId: job.client_id,
        docId: researchDocId,
        filename: "website-research.md",
        body: mdBuffer,
        contentType: "text/markdown",
      });
      const researchDoc = await insertKBDocument({
        clientId: job.client_id,
        filename: "website-research.md",
        fileExt: "md",
        storageUrl: url,
        sizeBytes: mdBuffer.byteLength,
      });
      docIdsForVersion.push(researchDoc.id);
    }

    // 2. Insert the KB version + set active + flip kb_status.
    const version = await insertKBVersion({
      clientId: job.client_id,
      output: body.kbOutput,
      modelUsed: body.modelUsed,
      docIdsUsed: docIdsForVersion,
      fillRate: body.fillRate,
    });
    await setActiveKBVersion(job.client_id, version.id);
    await setKBStatus(job.client_id, "in_review");

    // 3. Mark the job succeeded.
    await markKBJobSucceeded({ jobId: body.jobId, versionId: version.id });

    return apiOk({ ok: true, versionId: version.id });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Webhook failed.";
    // Best-effort: mark the job failed so the UI escapes the running state.
    try { await markKBJobFailed({ jobId: body.jobId, error }); } catch {}
    return apiError(error, 500);
  }
}
