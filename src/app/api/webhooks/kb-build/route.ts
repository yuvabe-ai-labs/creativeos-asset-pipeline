import "server-only";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import {
  updateKBJobPhase,
  markKBJobSucceeded,
  markKBJobFailed,
  getKBJob,
} from "@/lib/db/kb-jobs";
import { insertKBDocument, insertKBVersion, setActiveKBVersion } from "@/lib/db/kb";
import { setKBStatus } from "@/lib/db/clients";
import { uploadKBDocument } from "@/lib/storage";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { ClientKBJobStatus } from "@/lib/db/types";

const NON_TERMINAL: ClientKBJobStatus[] = [
  "queued", "researching", "extracting", "finalizing",
];

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
};

type FailedPayload = {
  jobId: string;
  kind: "failed";
  error: string;
};

type Payload = PhasePayload | SucceededPayload | FailedPayload;

function isAuthorized(req: Request): boolean {
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("TRIGGER_WEBHOOK_SECRET is not set — all webhook calls will be rejected");
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return apiError("Unauthorized.", 401);

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }
  if (!body?.jobId || !body?.kind) return apiError("Missing jobId or kind.", 400);

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
    const job = await getKBJob(body.jobId);
    if (!job) return apiError("Job not found.", 404);
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
