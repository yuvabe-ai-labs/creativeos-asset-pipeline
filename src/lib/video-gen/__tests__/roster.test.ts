import { describe, it, expect } from "vitest";
import { videoGenClientModelMap, videoGenClientModelGroups } from "../client-models";

describe("video model roster", () => {
  it("contains the consolidated roster: Veo x3 + Kling 3.0 + Kling O1 + Kling 3.0 Omni + Seedance 2.5 + Gemini Omni", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "gemini:gemini-omni-1.1-flash",
      "kling:kling-3-0",
      // Added 2026-09-09 as the second multishot model (D235/D236).
      "kling:kling-3-0-omni",
      "kling:kling-o1",
      // Added 2026-09-09 as the third multishot model (D243) — the async create-then-poll
      // BytePlus transport, registered here as an ordinary single-shot model.
      "seedance:seedance-2-5",
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
  // Seedance sits between Kling and Google because that is the map's own declaration order
  // (client-models.ts registers it right after the Kling block) — groups preserve that order
  // rather than imposing one of their own.
  it("groups under Veo, Kling, Seedance, and Google — no OpenAI headers", () => {
    expect(videoGenClientModelGroups.map((g) => g.label)).toEqual([
      "Veo",
      "Kling",
      "Seedance",
      "Google",
    ]);
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
