import { describe, it, expect } from "vitest";
import { videoGenClientModelMap } from "../client-models";

describe("video model roster", () => {
  it("contains the union roster: Veo x3 + Sora 2 + Kling's 5 verified models", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "kling:kling-2-5-turbo",
      "kling:kling-2-6",
      "kling:kling-3-0",
      "kling:kling-3-0-turbo",
      "kling:kling-o1",
      "openai:sora-2",
      "veo:veo-3.1",
      "veo:veo-3.1-fast",
      "veo:veo-3.1-lite",
    ]);
  });

  it("includes Sora 2 and excludes the legacy kling-v1/v2 endpoints", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids).toContain("openai:sora-2");
    expect(ids.some((id) => /kling-v(1|2)/.test(id))).toBe(false);
  });
});
