import { describe, expect, it } from "vitest";
import { buildFailedMessage, buildSucceededMessage } from "../build-messages";

const READY = "The brand KB is built and ready for your review on the right.";
const COLLECTING = "Images and video from the site and socials are collected separately and may still be coming in. That does not block the review.";

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
    expect(buildFailedMessage("The website could not be reached.", { canRetry: true, unchanged: true })).toEqual({
      role: "assistant",
      content: 'The build failed: The website could not be reached.\n\nNothing was changed. Say "start the build" to try again.',
      card: { kind: "status", lines: [{ text: "Build failed", state: "failed" }] },
      suggestions: ["Start the build"],
    });
  });
});

describe("buildFailedMessage, when a retry from the chat would be refused", () => {
  it("does not offer a build it would refuse, and says the KB the client has is unchanged", () => {
    const m = buildFailedMessage("The website could not be reached.", { canRetry: false, unchanged: true });
    expect(m.content).toBe("The build failed: The website could not be reached.\n\nThe brand KB you already have is unchanged.");
    expect(m.suggestions).toEqual([]);
  });
  it("does not claim nothing changed when it cannot know", () => {
    const m = buildFailedMessage("Something broke while saving.", { canRetry: false, unchanged: false });
    expect(m.content).toBe("The build ran into a problem: Something broke while saving.\n\nCheck the brand KB on the right before trying again.");
    expect(m.content).not.toContain("Nothing was changed");
  });
});

describe("buildSucceededMessage, the account of what it found", () => {
  const built = (account: { total: number; filled: number; inferred: number; empty: number }) =>
    buildSucceededMessage({ hadWebsite: false, documentCount: 1, skipped: [], account }).content;

  it("says how much it filled, inferred and could not find", () => {
    expect(built({ total: 43, filled: 36, inferred: 8, empty: 7 })).toBe(
      `${READY}\n\nI filled 36 of 43 fields. 8 of them I inferred and could not find stated. 7 I could not find at all.`,
    );
  });
  it("says so when everything was stated", () => {
    expect(built({ total: 43, filled: 43, inferred: 0, empty: 0 })).toContain("I filled 43 of 43 fields. All of them were stated in the sources.");
  });
  it("leaves out the half that does not apply", () => {
    expect(built({ total: 43, filled: 43, inferred: 2, empty: 0 })).toContain("I filled 43 of 43 fields. 2 of them I inferred and could not find stated.");
    expect(built({ total: 43, filled: 40, inferred: 0, empty: 3 })).toContain("I filled 40 of 43 fields. 3 I could not find at all.");
  });
  it("says nothing of it for a KB with no fields to count", () => {
    expect(built({ total: 0, filled: 0, inferred: 0, empty: 0 })).toBe(READY);
  });
});
