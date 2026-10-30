import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePromptFor,
  videoPromptFor,
} from "../video-prompt-generate";
import type { VideoPromptTarget } from "../video-prompt-shared";

describe("videoPromptGeneratePrompt (Veo)", () => {
  it("is a versioned, evaluable record", () => {
    expect(videoPromptGeneratePrompt.id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePrompt.version).toBeGreaterThanOrEqual(1);
    expect(videoPromptGeneratePrompt.system.length).toBeGreaterThan(100);
  });

  // D441 — the frame carries the product's look; words about it compete with the picture.
  it("pins the product to its picture rather than describing it (no word cap)", () => {
    const sys = videoPromptGeneratePrompt.system;
    expect(sys).toContain("exactly as in its reference");
    expect(sys).not.toMatch(/label text, logo, lettering, colours/);
    expect(sys).not.toMatch(/restate the preservation-critical identity/i);
    expect(sys).not.toMatch(/40[–-]90 words/);
  });

  it("is version 6 and keeps hype-word hygiene", () => {
    expect(videoPromptGeneratePrompt.version).toBe(6);
    expect(videoPromptGeneratePrompt.system).toContain("cinematic masterpiece");
  });
});

describe("videoPromptGeneratePromptFor", () => {
  it("returns the Veo record for veo", () => {
    expect(videoPromptGeneratePromptFor({ provider: "veo" }).id).toBe("video-prompt-generate");
  });
  it("returns the Kling record for kling", () => {
    expect(videoPromptGeneratePromptFor({ provider: "kling" }).id).toBe("video-prompt-generate-kling");
  });
});

// Regression (levitating product): a crane move generated "...lifts gently upward over the 8
// seconds so the jar feels more elevated", and Kling executed that literally — the jar rose off
// the plinth. Root cause was the camera clause being allowed to state an effect on the SUBJECT.
// A crane/boom is the one move that aliases to subject motion (a push-in or orbit cannot), so the
// ban has to be explicit. Both guardrails live in the shared SPINE — hence asserted on BOTH
// records; keeping them in a single variant is the regression this test exists to catch.
describe("SPINE camera-clause guardrails", () => {
  const RECORDS = [videoPromptGeneratePrompt, videoPromptGenerateKlingPrompt];

  it("bans subject-state phrasing inside the camera clause", () => {
    for (const record of RECORDS) {
      expect(record.system.toLowerCase()).toContain("never what the subject");
    }
  });

  it("requires the subject to stay in contact with its surface", () => {
    for (const record of RECORDS) {
      const sys = record.system.toLowerCase();
      expect(sys).toContain("physical contact");
      expect(sys).toMatch(/does not rise, float, or lift/);
    }
  });
});

describe("videoPromptGenerateKlingPrompt", () => {
  it("keeps camera IN the text (not camera-silent) and shares the i2v grounding", () => {
    const sys = videoPromptGenerateKlingPrompt.system;
    expect(sys.toLowerCase()).toContain("camera movement");
    expect(sys).not.toMatch(/do\s+NOT describe any camera/i);
    expect(sys.toLowerCase()).toContain("do not re-describe");
  });
  it("permits a trailing cinematic quality tag", () => {
    expect(videoPromptGenerateKlingPrompt.system.toLowerCase()).toContain("quality tag");
  });
});

// The bug this whole split exists to make unrepresentable: Gemini Omni receiving Veo's record.
it("gives every target its own record — no two share an object", () => {
  const targets: VideoPromptTarget[] = ["veo", "kling", "gemini-omni", "seedance"];
  const records = targets.map((t) => videoPromptFor(t));
  expect(new Set(records).size).toBe(targets.length);
  expect(new Set(records.map((r) => r.id)).size).toBe(targets.length);
});

it("Seedance's guide follows the vendor's own order, not the shared spine's", () => {
  const sys = videoPromptFor("seedance").system;
  expect(sys).toContain("@Image 1");
  // D445 — no on-screen text on any model, so no subtitle marker; D441 — no label inventory.
  expect(sys).not.toContain("【】");
  expect(sys).not.toMatch(/label text, logo, lettering, colours/);
  expect(sys).toContain("exactly as in its reference");
  // The single-shot record must not teach shot structure — that is the multishot writer's job.
  expect(sys).not.toMatch(/\d+-\d+s:/);
});
