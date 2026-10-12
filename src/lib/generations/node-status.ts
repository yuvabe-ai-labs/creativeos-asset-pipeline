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
