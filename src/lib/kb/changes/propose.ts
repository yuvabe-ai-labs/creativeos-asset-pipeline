// One kb-propose run (D505): read new or remaining documents against the brand KB as it stands and
// answer in the client's thread with a change card, or a line saying nothing changes. Called by
// the kb-propose task. State always moves: the job ends succeeded or failed with a plain reason.
import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages, listSettledChangeCards } from "@/lib/db/copilot-messages";
import { getActiveKBVersion, listKBDocuments } from "@/lib/db/kb";
import { describeError } from "@/lib/describe-error";
import { failJob, getJob, startJob, succeedJob } from "@/lib/jobs/db";
import { coerceValue, isEmpty, reviewFields } from "@/lib/journey/kb-copilot/review";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import { documentInput } from "@/lib/kb/document-input";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { createOpenAI } from "@/lib/openai/server";
import { kbProposePrompt, kbProposeSystem } from "@/prompts/kb-propose";
import { buildChangeCard, refusedKeys, type Proposal } from "./card";
import { listNames, proposalCopy, readingWhat } from "./copy";
import type { KbProposeInput } from "./start";

const answerSchema = z.object({
  changes: z.array(z.object({
    path: z.string(),
    value: z.union([z.string(), z.array(z.string()), z.null()]),
    document: z.string(),
  })),
});

/** The model's part, injected so the run is tested without it. */
export type ProposeModel = (args: { system: string; content: unknown[] }) => Promise<z.infer<typeof answerSchema>>;

const openaiProposeModel: ProposeModel = async ({ system, content }) => {
  const response = await createOpenAI().responses.parse({
    model: kbProposePrompt.model,
    input: [{ role: "system", content: system }, { role: "user", content: content as never }],
    text: { format: zodTextFormat(answerSchema, "changes") },
  });
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("The model returned no changes list.");
  return parsed;
};

export async function runKbProposal(jobId: string, deps: { model?: ProposeModel } = {}): Promise<void> {
  const job = await getJob<KbProposeInput>(jobId);
  if (!job?.client_id) return;
  const clientId = job.client_id;
  const input: KbProposeInput = { added: job.input?.added ?? [], removed: job.input?.removed ?? [] };
  const what = readingWhat(input);
  const say = async (content: string, card: Parameters<typeof insertCopilotMessages>[3][number]["card"]) => {
    const client = await getClientById(clientId);
    if (!client) return;
    await ensureOpening(client);
    await insertCopilotMessages(clientId, ONBOARDING, null, [{ role: "assistant", content, card, suggestions: [] }]);
  };

  try {
    await startJob(jobId, proposalCopy.reading(what));
    const version = await getActiveKBVersion(clientId);
    // No KB any more (deleted, or a rebuild in flight): there is nothing to propose against.
    if (!version) {
      await succeedJob(jobId, { fields: 0 });
      return;
    }
    const kb = version.output as unknown as TraceableBrandKB;
    const docs = await listKBDocuments(clientId);
    const added = docs.filter((d) => input.added.some((a) => a.id === d.id));
    // After a removal every remaining source is read, the new ones included; otherwise only the new.
    const material = input.removed.length > 0 ? docs : added;
    if (material.length === 0) {
      await succeedJob(jobId, { fields: 0 });
      return;
    }
    const fields = reviewFields(kb);
    const [content, settled] = await Promise.all([documentInput(material), listSettledChangeCards(clientId)]);
    const { changes } = await (deps.model ?? openaiProposeModel)({
      system: kbProposeSystem({ fields: fields.map((f) => ({ path: f.path, title: f.title, value: f.value })), added: added.map((d) => d.filename), removed: input.removed }),
      content,
    });

    const docIdByName = new Map(docs.map((d) => [d.filename, d.id]));
    const proposals: Proposal[] = changes.flatMap((change) => {
      const field = fields.find((f) => f.path === change.path);
      if (!field) return [];
      const value = change.value === null ? null : coerceValue(field.kind, change.value);
      const unsupported = value === null || isEmpty(value);
      return [{
        path: change.path,
        value: unsupported ? null : value,
        from: unsupported ? proposalCopy.unsupported : change.document,
        docId: unsupported ? null : (docIdByName.get(change.document) ?? null),
      }];
    });
    const card = buildChangeCard({ versionId: version.id, current: kb, proposals, refused: refusedKeys(settled) });
    const onlyRemoved = input.added.length === 0;
    const removedNames = listNames(input.removed);
    if (card) {
      const n = card.fields.length;
      await say(onlyRemoved ? proposalCopy.noLongerSupported(removedNames, n) : proposalCopy.wouldChange(what, n), card);
    } else {
      await say(onlyRemoved ? proposalCopy.nothingAfterRemoval(removedNames) : proposalCopy.nothing(what), { kind: "note" });
    }
    await succeedJob(jobId, { fields: card?.fields.length ?? 0 });
  } catch (e) {
    console.error("[kb-propose] failed", { jobId, error: describeError(e) });
    // Each on its own: the line in the thread is still written if marking the job fails.
    try {
      await failJob(jobId, proposalCopy.couldNotRead(what));
    } catch (failError) {
      console.error("[kb-propose] could not mark the job failed", { jobId, error: describeError(failError) });
    }
    try {
      await say(proposalCopy.couldNotReadLine(what), { kind: "note" });
    } catch (sayError) {
      console.error("[kb-propose] could not say it failed", { jobId, error: describeError(sayError) });
    }
  }
}
