import { describe, it, expect } from "vitest";
import { gemini25FlashParams, geminiFlash2Params, geminiProParams } from "../gemini";
import { smartMergeParams } from "../merge";
import { imageGenClientModelMap } from "../../client-models";
import type { ParamSpec } from "../../types";

function ratios(params: ParamSpec[]): string[] {
  const spec = params.find((p) => p.name === "aspect_ratio");
  if (!spec || spec.constraints.type !== "select") throw new Error("no aspect_ratio select");
  return spec.constraints.options;
}

// The ultra-wide/ultra-tall ratios are exclusive to gemini-3.1-flash-image. Verified against
// the live Gemini API: gemini-2.5-flash-image and gemini-3-pro-image both answer
// `400 INVALID_ARGUMENT — "Aspect ratio 4:1 is not supported for this model"`.
const UNSUPPORTED_BY_LEGACY = ["4:1", "1:4"];

describe("gemini aspect_ratio options", () => {
  it("gemini-2.5-flash-image does not offer ratios the model rejects", () => {
    for (const r of UNSUPPORTED_BY_LEGACY) {
      expect(ratios(gemini25FlashParams)).not.toContain(r);
    }
  });

  it("gemini-2.5-flash-image keeps the ratios the model does accept", () => {
    // 21:9 is accepted by the live API (returns 1536x672), so it stays offered.
    expect(ratios(gemini25FlashParams)).toEqual(
      expect.arrayContaining(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]),
    );
  });

  it("gemini-3.1-flash-image still offers 4:1 and 1:4 — it supports them", () => {
    for (const r of UNSUPPORTED_BY_LEGACY) {
      expect(ratios(geminiFlash2Params)).toContain(r);
    }
  });

  it("gemini-3-pro-image does not offer ratios the model rejects", () => {
    for (const r of UNSUPPORTED_BY_LEGACY) {
      expect(ratios(geminiProParams)).not.toContain(r);
    }
  });

  it("a node persisted with 4:1 on Nano Banana falls back to a supported ratio", () => {
    // Nodes saved while the unsupported option was still offered must self-heal rather than
    // keep sending a value the provider 400s on.
    const model = imageGenClientModelMap["gemini:gemini-2.5-flash-image"];
    const merged = smartMergeParams({ aspect_ratio: "4:1", image_size: "1K" }, model);
    expect(ratios(gemini25FlashParams)).toContain(merged.aspect_ratio);
  });
});
