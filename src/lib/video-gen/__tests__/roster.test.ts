import { describe, it, expect } from "vitest";
import { videoGenClientModelMap, videoGenClientModelGroups } from "../client-models";

describe("video model roster", () => {
  it("contains the consolidated roster: Veo x3 + Kling 3.0 + Kling O1", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "kling:kling-3-0",
      "kling:kling-o1",
      "veo:veo-3.1",
      "veo:veo-3.1-fast",
      "veo:veo-3.1-lite",
    ]);
  });

  it("excludes Sora and the pruned Kling models", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids).not.toContain("openai:sora-2");
    expect(ids).not.toContain("kling:kling-3-0-turbo");
    expect(ids).not.toContain("kling:kling-2-6");
    expect(ids).not.toContain("kling:kling-2-5-turbo");
  });

  it("excludes the legacy kling-v1/v2 endpoints", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids.some((id) => /kling-v(1|2)/.test(id))).toBe(false);
  });
});

describe("picker groups", () => {
  it("groups under Veo and Kling only — no Google/OpenAI headers", () => {
    expect(videoGenClientModelGroups.map((g) => g.label)).toEqual(["Veo", "Kling"]);
  });

  it("puts Lite/Fast/Quality under the Veo group", () => {
    const veo = videoGenClientModelGroups.find((g) => g.label === "Veo")!;
    expect(veo.models.map((m) => m.label)).toEqual([
      "Veo 3.1 Lite",
      "Veo 3.1 Fast",
      "Veo 3.1 Quality",
    ]);
  });
});
