import "server-only";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk/v3";
import { getClientById } from "@/lib/db/clients";
import { listKBDocuments } from "@/lib/db/kb";
import { insertKBJob, setKBJobTriggerRunId } from "@/lib/db/kb-jobs";
import { BuildAlreadyRunningError, NothingToBuildFromError } from "./build-errors";

// Starting the brand KB build, shared by the form's server action and the brand KB copilot, so
// both start it the same way. The caller is authorised before this is called.

export { BuildAlreadyRunningError, NothingToBuildFromError };

/** Reads the client fresh (a website saved a moment ago counts), inserts the job, and queues the
 *  background build. The one-running-job index is what refuses a second build. */
export async function startKBBuild(clientId: string): Promise<{ jobId: string }> {
  const [client, docs] = await Promise.all([getClientById(clientId), listKBDocuments(clientId)]);
  if (!client) throw new Error("Client not found.");
  if (!client.website_url && docs.length === 0) throw new NothingToBuildFromError();

  const docIds = docs.map((d) => d.id);
  let job;
  try {
    job = await insertKBJob({ clientId, orgId: client.org_id, websiteUrl: client.website_url, docIdsUsed: docIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    if (msg.includes("client_kb_jobs_one_running_idx") || msg.includes("23505")) throw new BuildAlreadyRunningError();
    throw e;
  }

  const run = await tasks.trigger("kb-build", { jobId: job.id, clientId, websiteUrl: client.website_url, docIds });
  await setKBJobTriggerRunId(job.id, run.id);
  revalidatePath(`/clients/${client.slug}/kb`);
  return { jobId: job.id };
}
