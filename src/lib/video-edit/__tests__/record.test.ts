import { describe, it, expect } from "vitest";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { plainVideoEditFailure, VIDEO_EDIT_FAILED_MESSAGE, VIDEO_EDIT_REFUSED_MESSAGE, readVideoEdit, videoEditEstimateCredits, videoEditGate, VIDEO_EDIT_MAX_SECONDS } from "../record";

const RECORD = {
  baseVersionId: "v3", rootVersionId: "v1", instruction: "make the flour beige", editPrompt: "make the flour beige\n\nKeep…",
  referenceNodeIds: ["n-pack"], referenceUrls: ["https://storage.googleapis.com/b/pack.jpg"], resolution: "720p",
};

describe("readVideoEdit", () => {
  it("reads a complete record", () => {
    expect(readVideoEdit(RECORD)).toEqual(RECORD);
  });
  it("returns null for anything incomplete or malformed", () => {
    expect(readVideoEdit(null)).toBeNull();
    expect(readVideoEdit({ ...RECORD, baseVersionId: 3 })).toBeNull();
    expect(readVideoEdit({ ...RECORD, resolution: "8k" })).toBeNull();
    expect(readVideoEdit({ ...RECORD, referenceUrls: "x" })).toBeNull();
  });
});

describe("videoEditEstimateCredits", () => {
  it("prices the take at Omni's rate for the resolution", () => {
    expect(videoEditEstimateCredits(6, "720p")).toBe(usdToFinalCredits(computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, true, "720p")!.usd));
    expect(videoEditEstimateCredits(6, "4k")).toBeGreaterThan(videoEditEstimateCredits(6, "720p"));
  });
});

describe("videoEditGate", () => {
  const ok = { sourceId: "v3", instruction: "make it red", durationSeconds: 6, running: false, locked: null, submitting: false };
  it("allows a finished take with an instruction", () => {
    expect(videoEditGate(ok)).toEqual({ ok: true });
  });
  it("names the first thing in the way", () => {
    expect(videoEditGate({ ...ok, locked: "In the Editor" })).toEqual({ ok: false, reason: "In the Editor" });
    expect(videoEditGate({ ...ok, sourceId: null })).toEqual({ ok: false, reason: "Generate a take first." });
    expect(videoEditGate({ ...ok, running: true })).toEqual({ ok: false, reason: "Wait for the current job to finish." });
    expect(videoEditGate({ ...ok, instruction: "   " })).toEqual({ ok: false, reason: "Describe the change first." });
    expect(videoEditGate({ ...ok, durationSeconds: VIDEO_EDIT_MAX_SECONDS + 1 })).toEqual({ ok: false, reason: "Edits work on takes up to 10 seconds." });
    expect(videoEditGate({ ...ok, submitting: true })).toEqual({ ok: false, reason: "Starting…" });
  });
});

describe("plainVideoEditFailure", () => {
  it("keeps the refused message", () => {
    expect(plainVideoEditFailure(VIDEO_EDIT_REFUSED_MESSAGE)).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
  });
  it("replaces anything else with the plain failed message", () => {
    expect(plainVideoEditFailure("Omni edit failed (500)")).toBe(VIDEO_EDIT_FAILED_MESSAGE);
    expect(plainVideoEditFailure("Failed to fetch image (404): https://x")).toBe(VIDEO_EDIT_FAILED_MESSAGE);
    expect(VIDEO_EDIT_FAILED_MESSAGE).toBe("The edit didn't finish. Try again.");
  });
});
