import { describe, it, expect } from "vitest";
import {
  videoGenClientModelMap,
  DEFAULT_VIDEO_CLIENT_MODEL_ID,
} from "../client-models";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/ai-models/model-ids";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const isDeprecated = (id: string) => videoGenClientModelMap[id]?.deprecated === true;
const videoGroups = () => videoModelsFrom(seededModelCatalog()).groups();

describe("video model roster", () => {
  it("D461: deprecates exactly the three Veo models, and never defaults to a deprecated one", () => {
    const deprecated = Object.keys(videoGenClientModelMap).filter(isDeprecated).sort();
    expect(deprecated).toEqual(["veo:veo-3.1", "veo:veo-3.1-fast", "veo:veo-3.1-lite"]);
    expect(isDeprecated(DEFAULT_VIDEO_CLIENT_MODEL_ID)).toBe(false);
  });

  it("contains the consolidated roster: Veo x3 + Kling 3.0 + Kling O1 + Kling 3.0 Omni + Seedance 2.5 + Gemini Omni", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "gemini:gemini-omni-1.1-flash",
      // Added 2026-11-10 (D484); 1.1 stays selectable until it is retired.
      "gemini:gemini-omni-1.2-flash",
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
    expect(videoGroups().map((g) => g.label)).toEqual([
      "Kling",
      "Seedance",
      "Google",
    ]);
  });

  it("D461: offers no deprecated model, and drops the provider left with none", () => {
    const offered = videoGroups().flatMap((g) => g.models);
    expect(offered.some((m) => m.deprecated)).toBe(false);
    expect(videoGroups().find((g) => g.label === "Veo")).toBeUndefined();
  });
});

describe("deprecated model fallback (D461)", () => {
  it("defaults to Gemini Omni", () => {
    expect(DEFAULT_VIDEO_CLIENT_MODEL_ID).toBe(GEMINI_OMNI_MODEL_ID);
  });
});
