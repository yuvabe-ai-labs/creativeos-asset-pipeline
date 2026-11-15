import type { NewCopilotMessage } from "@/lib/db/copilot-messages";
import type { StatusLine } from "@/lib/journey/thread/schema";
import { START_BUILD_CHOICE } from "./context";

// What the build itself says in the thread when it lands or fails (spec §2.2). Written by the
// build's webhook, with no model: nobody typed, so nothing is asked of one.

const done = (text: string): StatusLine => ({ text, state: "done" });

export function buildSucceededMessage(input: {
  hadWebsite: boolean; documentCount: number; skipped: { filename: string; reason: string }[];
}): NewCopilotMessage {
  const paragraphs = [
    "The brand KB is built and ready for your review on the right.",
    // The collection of images and video takes longer than the KB text, and only runs for a website or socials.
    ...(input.hadWebsite ? ["Images and video from the site and socials are still being collected. That does not block the review."] : []),
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

export function buildFailedMessage(error: string): NewCopilotMessage {
  return {
    role: "assistant",
    content: `The build failed: ${error}\n\nNothing was changed. Say "start the build" to try again.`,
    card: { kind: "status", lines: [{ text: "Build failed", state: "failed" }] },
    suggestions: [START_BUILD_CHOICE],
  };
}
