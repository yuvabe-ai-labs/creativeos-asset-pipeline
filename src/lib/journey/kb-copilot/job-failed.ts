import "server-only";
import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages, type NewCopilotMessage } from "@/lib/db/copilot-messages";
import { describeError } from "@/lib/describe-error";
import type { BackgroundJobRow, JobKind } from "@/lib/jobs/types";
import { proposalCopy, readingWhat } from "@/lib/kb/changes/copy";
import type { KbProposeInput } from "@/lib/kb/changes/start";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import { IMPORT_LABEL, type ImportSource } from "./context";

// A background job the brand KB copilot speaks about failed (D506): it is said once, in the thread,
// at the moment it fails, and stays where it happened. Never repeated at the bottom of the panel,
// where yesterday's failure would read as news under every new message.

/** What the copilot says when a job of this kind fails, and what the person can do; null for a job
 *  it does not speak about. */
export function jobFailedLine(kind: JobKind, input: unknown): string | null {
  const given = (input ?? {}) as Record<string, unknown>;
  if (kind === "asset-import") {
    const source = given.source as ImportSource | undefined;
    return source && IMPORT_LABEL[source]
      ? `Could not collect images and video from ${IMPORT_LABEL[source]}. You can try again from Brand assets.`
      : null;
  }
  if (kind === "image-analysis") return "Could not study the images. You can run it again from the Image Analysis tab.";
  if (kind === "kb-propose") {
    const proposal = given as Partial<KbProposeInput>;
    return proposalCopy.couldNotReadLine(readingWhat({ added: proposal.added ?? [], removed: proposal.removed ?? [] }));
  }
  return null;
}

/** The stored form: one failed status line, no words, drawn as it was drawn live. */
export function failedLineMessage(text: string): NewCopilotMessage {
  return { role: "assistant", content: "", card: { kind: "status", lines: [{ text, state: "failed" }] }, suggestions: [] };
}

/** Says in the client's thread that the job failed. Best effort: it never throws, so a job is
 *  always marked failed whether or not the line could be written. */
export async function sayJobFailed(job: Pick<BackgroundJobRow<unknown>, "client_id" | "kind" | "input">): Promise<void> {
  const line = jobFailedLine(job.kind, job.input);
  if (!job.client_id || !line) return;
  try {
    const client = await getClientById(job.client_id);
    if (!client) return;
    // The opening is always the thread's first line, even when a failure is the first thing to say.
    await ensureOpening(client);
    await insertCopilotMessages(job.client_id, ONBOARDING, null, [failedLineMessage(line)]);
  } catch (e) {
    console.error("[copilot] could not say a job failed", { clientId: job.client_id, kind: job.kind, error: describeError(e) });
  }
}
