import { describe, expect, it } from "vitest";
import { buildFailedMessage, buildSucceededMessage } from "../build-messages";

const READY = "The brand KB is built and ready for your review on the right.";
const COLLECTING = "Images and video from the site and socials are still being collected. That does not block the review.";

describe("buildSucceededMessage", () => {
  it("says what was read from a website and two documents", () => {
    const m = buildSucceededMessage({ hadWebsite: true, documentCount: 2, skipped: [] });
    expect(m.role).toBe("assistant");
    expect(m.content).toBe(`${READY}\n\n${COLLECTING}`);
    expect(m.card).toEqual({
      kind: "status",
      lines: [
        { text: "Read the website", state: "done" },
        { text: "Read 2 documents", state: "done" },
        { text: "Built the brand KB", state: "done" },
      ],
    });
  });

  it("leaves out the website and the collection when there was no website", () => {
    const m = buildSucceededMessage({ hadWebsite: false, documentCount: 1, skipped: [] });
    expect(m.content).toBe(READY);
    expect(m.card).toEqual({
      kind: "status",
      lines: [{ text: "Read 1 document", state: "done" }, { text: "Built the brand KB", state: "done" }],
    });
  });

  it("names the files it could not read", () => {
    const m = buildSucceededMessage({
      hadWebsite: false, documentCount: 3,
      skipped: [{ filename: "a.pdf", reason: "too large" }, { filename: "b.docx", reason: "unsupported" }],
    });
    expect(m.content).toBe(`${READY}\n\nI could not read: a.pdf (too large), b.docx (unsupported).`);
  });
});

describe("buildFailedMessage", () => {
  it("says it failed, that nothing changed, and how to try again", () => {
    expect(buildFailedMessage("The website could not be reached.")).toEqual({
      role: "assistant",
      content: 'The build failed: The website could not be reached.\n\nNothing was changed. Say "start the build" to try again.',
      card: { kind: "status", lines: [{ text: "Build failed", state: "failed" }] },
      suggestions: ["Start the build"],
    });
  });
});
