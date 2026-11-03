import { describe, it, expect } from "vitest";
import {
  videoGenClientModelMap,
  videoGenClientModelGroups,
  isVideoModelDeprecated,
  usableVideoModelId,
  withoutDeprecatedVideoModel,
  defaultsForVideoModel,
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
  GEMINI_OMNI_MODEL_ID,
} from "../client-models";

describe("video model roster", () => {
  it("D461: deprecates exactly the three Veo models, and never defaults to a deprecated one", () => {
    const deprecated = Object.keys(videoGenClientModelMap).filter(isVideoModelDeprecated).sort();
    expect(deprecated).toEqual(["veo:veo-3.1", "veo:veo-3.1-fast", "veo:veo-3.1-lite"]);
    expect(isVideoModelDeprecated(DEFAULT_VIDEO_CLIENT_MODEL_ID)).toBe(false);
  });

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
      "Kling",
      "Seedance",
      "Google",
    ]);
  });

  it("D461: offers no deprecated model, and drops the provider left with none", () => {
    const offered = videoGenClientModelGroups.flatMap((g) => g.models);
    expect(offered.some((m) => m.deprecated)).toBe(false);
    expect(videoGenClientModelGroups.find((g) => g.label === "Veo")).toBeUndefined();
  });
});

describe("deprecated model fallback (D461)", () => {
  it("defaults to Gemini Omni", () => {
    expect(DEFAULT_VIDEO_CLIENT_MODEL_ID).toBe(GEMINI_OMNI_MODEL_ID);
  });

  it("moves a deprecated model to Omni with Omni's default params, dropping the old ones", () => {
    const next = withoutDeprecatedVideoModel({
      title: "Shot 1",
      modelId: "veo:veo-3.1-lite",
      params: { duration: "4", resolution: "1080p", aspect_ratio: "16:9" },
    });
    expect(next.title).toBe("Shot 1");
    expect(next.modelId).toBe(GEMINI_OMNI_MODEL_ID);
    expect(next.params).toEqual(defaultsForVideoModel(GEMINI_OMNI_MODEL_ID));
  });

  it("returns any other node's data as the same object", () => {
    const data = { modelId: "kling:kling-3-0", params: { duration: 5 } };
    expect(withoutDeprecatedVideoModel(data)).toBe(data);
    const noModel = { modelId: undefined, title: "Shot" };
    expect(withoutDeprecatedVideoModel(noModel)).toBe(noModel);
  });

  it("gives the model a node can generate on", () => {
    expect(usableVideoModelId("veo:veo-3.1")).toBe(GEMINI_OMNI_MODEL_ID);
    expect(usableVideoModelId("kling:kling-3-0")).toBe("kling:kling-3-0");
    expect(usableVideoModelId("openai:sora-2")).toBe(GEMINI_OMNI_MODEL_ID);
  });
});
