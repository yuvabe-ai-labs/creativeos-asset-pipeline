import { tasks } from "@trigger.dev/sdk";
import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { resolveOrgId } from "@/lib/dal";
import type { ExportJobInput } from "@/lib/editor/export-run";
import { getClientById } from "@/lib/db/clients";
import { loadEditorState } from "@/lib/editor/load-state";
import { reelName } from "@/lib/editor/package";
import { planSequence } from "@/lib/editor/sequence-plan";
import { planTranscription } from "@/lib/editor/transcribe-plan";
import { pausesFromWords } from "@/lib/editor/pauses";
import { listTranscripts } from "@/lib/db/media-transcripts";
import { failJob, failStaleJobs, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";

// Starts a Premiere export (D392): plans the reel from the SAVED edit, read fresh here (rule 10),
// then hands the job to the editor-export task. The task payload is the job id only (rule 8); the
// plan travels in the job's input. One export per Editor at a time.

const STALE_EXPORT_MS = 15 * 60 * 1000;
const BodySchema = z.object({ nodeId: z.uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId, canvas) =>
    withTryCatch("Couldn't start the export.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which Editor to export.", 400);
      const { nodeId } = parsed.data;

      const [state, orgId, client] = await Promise.all([loadEditorState(canvasId), resolveOrgId(), getClientById(canvas.client_id)]);
      if (!state || state.editorNodeId !== nodeId) return apiError("Editor not found.", 404);
      // D409 — pauses in speech become markers, from the transcripts already stored (no audio here).
      const { files } = planTranscription(state.doc, state.sources);
      const transcripts = await listTranscripts(files.map((f) => f.url));
      const pauses = new Map([...transcripts].map(([url, t]) => [url, pausesFromWords(t.words)] as const));
      // D416 — the sequence and the package are named after the client and the canvas.
      const planned = planSequence(state.doc, state.sources, { pauses, name: reelName(client?.name, canvas.name) });
      if (!planned.ok) return apiError(planned.reason, 422);

      const clientId = canvas.client_id;
      await failStaleJobs(clientId, "editor-export", STALE_EXPORT_MS);
      let jobId: string;
      try {
        const input: ExportJobInput = { canvasId, nodeId, clientId, plan: planned.plan };
        const job = await insertJob({
          orgId,
          clientId,
          kind: "editor-export",
          input,
          lockKey: `editor-export:${nodeId}`,
          phaseMessage: "Queued…",
        });
        jobId = job.id;
      } catch (err) {
        if (err instanceof JobLockedError) return apiError("An export of this reel is already running.", 409);
        throw err;
      }

      try {
        const run = await tasks.trigger("editor-export", { jobId });
        await setJobRunId(jobId, run.id);
      } catch {
        await failJob(jobId, "Couldn't start the export. Try again.");
        return apiError("Couldn't start the export. Try again.", 502);
      }
      return apiOk({ jobId }, 202);
    }),
  );
}
