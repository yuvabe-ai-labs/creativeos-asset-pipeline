import { describe, it, expect } from "vitest";
import { videoGenClientModelMap } from "../client-models";

describe("video model roster", () => {
  it("contains exactly Veo x3 + Kling 3.0", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "kling:kling-v3",
      "veo:veo-3.1",
      "veo:veo-3.1-fast",
      "veo:veo-3.1-lite",
    ]);
  });

  it("has no Sora or legacy Kling models", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids).not.toContain("openai:sora-2");
    expect(ids.some((id) => /kling-v(1|2)/.test(id))).toBe(false);
  });
});
