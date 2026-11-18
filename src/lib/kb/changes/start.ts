import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { failJob, insertJob, setJobRunId } from "@/lib/jobs/db";
import { describeError } from "@/lib/describe-error";
import { proposalCopy, readingWhat } from "./copy";

/** What one proposal reads (D505): documents just added, and the names of documents just removed. */
export type KbProposeInput = { added: { id: string; name: string }[]; removed: string[] };

/** Queues one proposal and returns at once. No lock: two sets of documents give two cards, each
 *  settled on its own. A run that cannot start fails its job, so the panel never waits on it. */
export async function startKbProposal(clientId: string, userId: string | null, input: KbProposeInput): Promise<void> {
  if (input.added.length === 0 && input.removed.length === 0) return;
  const client = await getClientById(clientId);
  if (!client) return;
  const what = readingWhat(input);
  const job = await insertJob({ orgId: client.org_id, clientId, kind: "kb-propose", input, phaseMessage: proposalCopy.reading(what), createdBy: userId });
  try {
    const run = await tasks.trigger("kb-propose", { jobId: job.id });
    await setJobRunId(job.id, run.id);
  } catch (e) {
    console.error("[kb-propose] could not queue", { jobId: job.id, error: describeError(e) });
    await failJob(job.id, proposalCopy.couldNotStart(what));
  }
}
