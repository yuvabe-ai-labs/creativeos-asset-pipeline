import type { NewCopilotMessage } from "@/lib/db/copilot-messages";
import type { StatusLine } from "@/lib/journey/thread/schema";
import { START_BUILD_CHOICE } from "./context";

// What the build itself says in the thread when it lands or fails (spec §2.2). Written by the
// build's webhook, with no model: nobody typed, so nothing is asked of one. Every sentence here
// has to be true whatever state the build left things in.

const done = (text: string): StatusLine => ({ text, state: "done" });

/** A short account of what it found and where it was unsure (spec §2.3). */
function accountSentence(a: { total: number; filled: number; inferred: number; empty: number }): string {
  const unsure = [
    ...(a.inferred > 0 ? [`${a.inferred} of them I inferred and could not find stated.`] : []),
    ...(a.empty > 0 ? [`${a.empty} I could not find at all.`] : []),
  ];
  return [`I filled ${a.filled} of ${a.total} fields.`, ...(unsure.length > 0 ? unsure : ["All of them were stated in the sources."])].join(" ");
}

export function buildSucceededMessage(input: {
  hadWebsite: boolean;
  /** Documents the build actually read. */
  documentCount: number;
  skipped: { filename: string; reason: string }[];
  /** What the build filled, inferred and could not find, counted from the KB it wrote. */
  account?: { total: number; filled: number; inferred: number; empty: number };
}): NewCopilotMessage {
  const paragraphs = [
    "The brand KB is built and ready for your review on the right.",
    ...(input.account && input.account.total > 0 ? [accountSentence(input.account)] : []),
    // The collection runs on its own and usually takes longer than the KB text. Whether it is still
    // running is not known here, so this does not claim that it is.
    ...(input.hadWebsite ? ["Images and video from the site and socials are collected separately and may still be coming in. That does not block the review."] : []),
    ...(input.skipped.length > 0
      ? [`I could not read: ${input.skipped.map((s) => `${s.filename} (${s.reason})`).join(", ")}.`]
      : []),
  ];
  const lines = [
    ...(input.hadWebsite ? [done("Read the website")] : []),
    ...(input.documentCount > 0 ? [done(`Read ${input.documentCount} document${input.documentCount === 1 ? "" : "s"}`)] : []),
    done("Built the brand KB"),
  ];
  return { role: "assistant", content: paragraphs.join("\n\n"), card: { kind: "status", lines } };
}

/** `canRetry`: the copilot would accept "start the build" (no brand KB exists yet).
 *  `unchanged`: the failure is known to have left everything as it was. */
export function buildFailedMessage(error: string, opts: { canRetry: boolean; unchanged: boolean }): NewCopilotMessage {
  const card = { kind: "status" as const, lines: [{ text: "Build failed", state: "failed" as const }] };
  if (!opts.unchanged) {
    return {
      role: "assistant", card, suggestions: [],
      content: `The build ran into a problem: ${error}\n\nCheck the brand KB on the right before trying again.`,
    };
  }
  if (!opts.canRetry) {
    return { role: "assistant", card, suggestions: [], content: `The build failed: ${error}\n\nThe brand KB you already have is unchanged.` };
  }
  return {
    role: "assistant", card, suggestions: [START_BUILD_CHOICE],
    content: `The build failed: ${error}\n\nNothing was changed. Say "start the build" to try again.`,
  };
}
