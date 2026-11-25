import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { claimCopilotCard } from "@/lib/db/copilot-messages";
import { describeError } from "@/lib/describe-error";
import { failJob, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import type { BrandsCard, MarketBrand } from "@/lib/journey/thread/schema";
import { MARKET_FETCH_KIND, type MarketJobKind } from "./constants";

// Starting the market research agent's two background jobs (D530), the kb-propose pattern: a job
// row, then the Trigger.dev task. One market job runs per client at a time (its lock key), so a
// draft never reads a fetch half done and a double click never pays twice.

export type MarketFetchInput = { messageId: string; brands: { handle: string; group: MarketBrand["group"] }[] };
export type MarketDraftInput = { focus: string | null };

const COULD_NOT_START: Record<MarketJobKind, string> = {
  "market-fetch": "I could not start bringing in their posts. Nothing was fetched; ask me to try again.",
  "market-draft": "I could not start drafting signals. Ask me to try again.",
};

/** The line shown while a fetch runs. */
export const fetchingLine = (brands: number) => `Bringing in posts from ${brands} brand${brands === 1 ? "" : "s"}…`;

/** Queues one market job and returns its id. Throws JobLockedError while another market job of
 *  this client is live, and an Error with a sentence for the person when the task cannot start. */
export async function startMarketJob(input: {
  client: { id: string; org_id: string }; userId: string | null;
  kind: MarketJobKind; input: MarketFetchInput | MarketDraftInput; phase: string;
}): Promise<string> {
  const job = await insertJob({
    orgId: input.client.org_id, clientId: input.client.id, kind: input.kind, input: input.input,
    lockKey: `market:${input.client.id}`, phaseMessage: input.phase, createdBy: input.userId,
  });
  try {
    const run = await tasks.trigger(input.kind, { jobId: job.id });
    await setJobRunId(job.id, run.id);
  } catch (e) {
    console.error(`[${input.kind}] could not queue`, { jobId: job.id, error: describeError(e) });
    await failJob(job.id, COULD_NOT_START[input.kind]);
    throw new Error(COULD_NOT_START[input.kind]);
  }
  return job.id;
}

export type ConfirmResult = { status: "started"; jobId: string } | { status: "moved" } | { status: "none" } | { status: "running" };

/** A person confirmed a brands card (in the chat or with its button): fetch the brands kept. The
 *  card moves pending → fetching first, so a second confirm finds it moved and starts nothing.
 *  `keep`, when given, is the handles to fetch; the others are switched off. */
export async function confirmBrands(input: {
  client: { id: string; org_id: string }; userId: string | null;
  messageId: string; card: BrandsCard; keep?: string[];
}): Promise<ConfirmResult> {
  const { client, messageId, card } = input;
  const brands = input.keep ? card.brands.map((b) => ({ ...b, keep: input.keep!.includes(b.handle) })) : card.brands;
  const kept = brands.filter((b) => b.keep);
  if (kept.length === 0) return { status: "none" };
  const fetching: BrandsCard = { ...card, brands, status: "fetching" };
  if (!(await claimCopilotCard(client.id, messageId, "brands", "pending", fetching))) return { status: "moved" };
  let jobId: string;
  try {
    jobId = await startMarketJob({
      client, userId: input.userId, kind: MARKET_FETCH_KIND,
      input: { messageId, brands: kept.map((b) => ({ handle: b.handle, group: b.group })) },
      phase: fetchingLine(kept.length),
    });
  } catch (e) {
    // Nothing was fetched: the list waits for the person again.
    await claimCopilotCard(client.id, messageId, "brands", "fetching", { ...fetching, status: "pending" });
    if (e instanceof JobLockedError) return { status: "running" };
    throw e;
  }
  await claimCopilotCard(client.id, messageId, "brands", "fetching", { ...fetching, jobId });
  return { status: "started", jobId };
}
