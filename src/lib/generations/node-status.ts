// D366 — a node's generation status, derived from the canvas's one generations feed (trayJobs)
// rather than a query and a channel per node. Pure, so it is tested on its own.
import type { GenerationRow } from "@/lib/db/types";

export type GenerationJobKind = "image" | "video" | "voice";

export type NodeGenerationStatus = {
  isGenerating: boolean;
  kind: GenerationJobKind | null;
  lastError: string | null;
};

export function jobKindOf(type: GenerationRow["type"]): GenerationJobKind {
  return type === "voice" ? "voice" : type === "image" ? "image" : "video";
}

/** Whether `candidate` should replace `current` as a node's latest job: the same job updated, or
 *  one created later. */
export function isNewerJob(candidate: GenerationRow, current: GenerationRow | undefined): boolean {
  if (!current || candidate.id === current.id) return true;
  return Date.parse(candidate.created_at) > Date.parse(current.created_at);
}

/** A start the client has marked but the feed may not yet speak for. `generationId` is the job's
 *  row id when the start response named it. */
export type GenerationStartMark = { kind: GenerationJobKind; generationId?: string };

/** Whether a row arriving on the feed retires a node's start mark: a mark that names its job
 *  clears on that job's row, whatever its status; a mark without an id clears on any row that
 *  advances the node's latest job. An update to an older job never clears it. */
export function clearsStartMark(mark: GenerationStartMark, row: GenerationRow, advancesLatest: boolean): boolean {
  return mark.generationId ? row.id === mark.generationId : advancesLatest;
}

function isTerminal(row: GenerationRow): boolean {
  return row.status === "succeeded" || row.status === "failed";
}

/** The row to keep when a loaded row meets one already on the feed: a stale `running` row never
 *  overwrites a finished one (a hydrate can land after the live update). */
export function mergeJob(existing: GenerationRow | undefined, incoming: GenerationRow): GenerationRow {
  return existing && isTerminal(existing) && incoming.status === "running" ? existing : incoming;
}

/** `started` covers the moment between a start being accepted and its row arriving on the feed;
 *  `requestError` is a start request that failed before any row existed. */
export function nodeGenerationStatus(
  latest: GenerationRow | undefined,
  started: GenerationJobKind | undefined,
  requestError: string | null,
): NodeGenerationStatus {
  if (started) return { isGenerating: true, kind: started, lastError: null };
  if (latest?.status === "running") return { isGenerating: true, kind: jobKindOf(latest.type), lastError: null };
  const jobError = latest?.status === "failed" ? latest.error ?? "Generation failed" : null;
  return { isGenerating: false, kind: null, lastError: requestError ?? jobError };
}

export type CompletionEffect = {
  toast: { tone: "success" | "error"; message: string };
  /** An image to put on the node's card (the job finished in the background). */
  cardImage: string | null;
};

/** What the canvas does when a job it saw running finishes: once per canvas, not once per node. */
export function completionEffect(
  previous: GenerationRow | undefined,
  next: GenerationRow,
): CompletionEffect | null {
  if (next.type === "prompt") return null;
  if (previous?.status !== "running" || next.status === "running") return null;
  const voice = next.type === "voice";
  if (next.status === "succeeded") {
    const message = voice ? "Voice changed and added as a new version" : next.type === "image" ? "Image ready" : "Video ready";
    return {
      toast: { tone: "success", message },
      cardImage: next.type === "image" ? next.output_snapshot : null,
    };
  }
  return {
    toast: { tone: "error", message: next.error ?? (voice ? "Voice change failed" : "Generation failed") },
    cardImage: null,
  };
}
