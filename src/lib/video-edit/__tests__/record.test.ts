import { describe, it, expect } from "vitest";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  plainVideoEditFailure, VIDEO_EDIT_FAILED_MESSAGE, VIDEO_EDIT_REFUSED_MESSAGE, VIDEO_EDIT_DEFAULT_MODEL_ID,
  readVideoEdit, videoEditEstimateCredits, videoEditGate, videoEditLimitsFor, editResolutionForTake,
} from "../record";

const RECORD = {
  baseVersionId: "v3", rootVersionId: "v1", instruction: "make the flour beige", editPrompt: "make the flour beige\n\nKeep…",
  referenceNodeIds: ["n-pack"], referenceUrls: ["https://storage.googleapis.com/b/pack.jpg"], resolution: "720p",
};

describe("readVideoEdit", () => {
  it("reads a complete record", () => {
    expect(readVideoEdit(RECORD)).toEqual(RECORD);
  });
  it("keeps a known model and drops an unknown one", () => {
    expect(readVideoEdit({ ...RECORD, modelId: GEMINI_OMNI_11_MODEL_ID })?.modelId).toBe(GEMINI_OMNI_11_MODEL_ID);
    expect(readVideoEdit({ ...RECORD, modelId: "veo:veo-3.1" })).toEqual(RECORD);
  });
  it("returns null for anything incomplete or malformed", () => {
    expect(readVideoEdit(null)).toBeNull();
    expect(readVideoEdit({ ...RECORD, baseVersionId: 3 })).toBeNull();
    expect(readVideoEdit({ ...RECORD, resolution: "8k" })).toBeNull();
    expect(readVideoEdit({ ...RECORD, referenceUrls: "x" })).toBeNull();
  });
});

describe("videoEditEstimateCredits", () => {
  it("prices the take at the chosen model's rate for the resolution", () => {
    for (const m of [GEMINI_OMNI_12_MODEL_ID, GEMINI_OMNI_11_MODEL_ID] as const) {
      expect(videoEditEstimateCredits(6, "720p", m)).toBe(usdToFinalCredits(computeVideoCost(m, 6, true, "720p")!.usd));
      expect(videoEditEstimateCredits(6, "4k", m)).toBeGreaterThan(videoEditEstimateCredits(6, "720p", m));
    }
  });
});

describe("videoEditGate", () => {
  const ok = {
    sourceId: "v3", instruction: "make it red", durationSeconds: 6, referenceCount: 2,
    modelId: GEMINI_OMNI_12_MODEL_ID, running: false, locked: null, submitting: false,
  } as const;
  it("allows a finished take with an instruction", () => {
    expect(videoEditGate(ok)).toEqual({ ok: true });
  });
  it("names the first thing in the way", () => {
    expect(videoEditGate({ ...ok, locked: "In the Editor" })).toEqual({ ok: false, reason: "In the Editor" });
    expect(videoEditGate({ ...ok, sourceId: null })).toEqual({ ok: false, reason: "Generate a take first." });
    expect(videoEditGate({ ...ok, running: true })).toEqual({ ok: false, reason: "Wait for the current job to finish." });
    expect(videoEditGate({ ...ok, instruction: "   " })).toEqual({ ok: false, reason: "Describe the change first." });
    expect(videoEditGate({ ...ok, durationSeconds: 16 })).toEqual({ ok: false, reason: "Omni 1.2 edits takes up to 15 seconds." });
    expect(videoEditGate({ ...ok, durationSeconds: 12, modelId: GEMINI_OMNI_11_MODEL_ID })).toEqual({ ok: false, reason: "Omni 1.1 edits takes up to 10 seconds." });
    expect(videoEditGate({ ...ok, referenceCount: 25 })).toEqual({ ok: false, reason: "Omni 1.2 takes up to 24 references. Untick some." });
    expect(videoEditGate({ ...ok, referenceCount: 13, modelId: GEMINI_OMNI_11_MODEL_ID })).toEqual({ ok: false, reason: "Omni 1.1 takes up to 12 references. Untick some." });
    expect(videoEditGate({ ...ok, referenceCount: 12, modelId: GEMINI_OMNI_11_MODEL_ID })).toEqual({ ok: true });
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

describe("videoEditLimitsFor", () => {
  it("reads each model's take length and reference cap off its spec", () => {
    expect(videoEditLimitsFor(GEMINI_OMNI_12_MODEL_ID)).toEqual({ label: "Omni 1.2", maxSeconds: 15, maxReferences: 24 });
    expect(videoEditLimitsFor(GEMINI_OMNI_11_MODEL_ID)).toEqual({ label: "Omni 1.1", maxSeconds: 10, maxReferences: 12 });
    expect(VIDEO_EDIT_DEFAULT_MODEL_ID).toBe(GEMINI_OMNI_12_MODEL_ID);
  });
});

describe("editResolutionForTake", () => {
  it("keeps the take's own resolution when an edit offers it", () => {
    expect(editResolutionForTake("1080p")).toBe("1080p");
    expect(editResolutionForTake("4K")).toBe("4k");
  });
  it("picks the closest offered one otherwise, and 720p when there is none", () => {
    expect(editResolutionForTake("480p")).toBe("360p");
    expect(editResolutionForTake("2k")).toBe("1080p");
    expect(editResolutionForTake(undefined)).toBe("720p");
    expect(editResolutionForTake("auto")).toBe("720p");
  });
});
