import { KB_JOB_NON_TERMINAL_STATUSES } from "@/lib/kb/constants";
import type { StatusLine } from "@/lib/journey/thread/schema";

// What the brand KB copilot knows about a client, and everything it says without a model: the
// opening line, the fallback reply choice and the live status. Pure, so the copy is tested exactly.

export type ImportSource = "website" | "instagram" | "facebook";

export type KbContext = {
  clientName: string;
  kbStatus: "pending" | "in_review" | "ready";
  /** An active KB version exists. */
  hasVersion: boolean;
  websiteUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  /** Uploaded documents, not counting the website research the build writes itself. */
  documentCount: number;
  /** Uploaded images. */
  imageCount: number;
  /** The latest KB build job. */
  job: { status: string; phaseMessage: string | null } | null;
  /** Collections of images and video running right now. */
  importing: ImportSource[];
  studyingImages: boolean;
};

const NON_TERMINAL: readonly string[] = KB_JOB_NON_TERMINAL_STATUSES;

export function isBuilding(ctx: KbContext): boolean {
  return ctx.job !== null && NON_TERMINAL.includes(ctx.job.status);
}

/** The same minimum the form asks for: a website or at least one document, and nothing built yet. */
export function canStartBuild(ctx: KbContext): boolean {
  return !isBuilding(ctx) && !ctx.hasVersion && (ctx.websiteUrl !== null || ctx.documentCount > 0);
}

function host(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function sourcesSummary(ctx: KbContext): string {
  const parts = [
    ...(ctx.websiteUrl ? [`the website ${host(ctx.websiteUrl)}`] : []),
    ...(ctx.documentCount > 0 ? [count(ctx.documentCount, "document")] : []),
    ...(ctx.imageCount > 0 ? [count(ctx.imageCount, "image")] : []),
  ];
  if (parts.length === 0) return "nothing yet";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function openingMessage(ctx: KbContext): string {
  const name = ctx.clientName;
  if (isBuilding(ctx)) return `The brand KB for ${name} is being built. I will say here when it is ready to review.`;
  if (ctx.kbStatus === "ready") {
    return `${name}'s brand KB is approved.\n\nTo add to it, attach a document or an image here, or tell me what changed.`;
  }
  if (ctx.hasVersion) {
    return `${name}'s brand KB is built and waiting for your review on the right.\n\nReview each section there. You can mark the KB ready once every field is reviewed.`;
  }
  if (canStartBuild(ctx)) {
    return `I have ${sourcesSummary(ctx)} for ${name}.\n\nShall I start the build?\nYou can add Instagram or Facebook handles, documents or images first.`;
  }
  return `Let's build ${name}'s brand KB.\n\nWhat is the brand's website?\nNo website? Attach brand documents here instead.`;
}

export const START_BUILD_CHOICE = "Start the build";

export function fallbackSuggestions(ctx: KbContext): string[] {
  return canStartBuild(ctx) ? [START_BUILD_CHOICE] : [];
}

const IMPORT_LABEL: Record<ImportSource, string> = { website: "the website", instagram: "Instagram", facebook: "Facebook" };

/** What is running right now, read from the real jobs. Empty when nothing is. */
export function liveStatus(ctx: KbContext): StatusLine[] {
  const running = (text: string): StatusLine => ({ text, state: "running" });
  return [
    ...(isBuilding(ctx) ? [running(ctx.job?.phaseMessage ?? "Starting the build…")] : []),
    ...ctx.importing.map((source) => running(`Collecting images and video from ${IMPORT_LABEL[source]}…`)),
    ...(ctx.studyingImages ? [running("Studying the images…")] : []),
  ];
}
