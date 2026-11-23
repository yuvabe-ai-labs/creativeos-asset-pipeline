import { describe, it, expect } from "vitest";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/ai-models/model-ids";
import { DEFAULT_VIDEO_MODEL_ID } from "@/lib/ai-models/default-models";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const videoModels = () => videoModelsFrom(seededModelCatalog());
const ids = () => videoModels().all.map((m) => m.id);
const isDeprecated = (id: string) => videoModels().get(id)?.deprecated === true;
const videoGroups = () => videoModels().groups();

describe("video model roster", () => {
  it("D461: deprecates exactly the three Veo models, and never defaults to a deprecated one", () => {
    const deprecated = ids().filter(isDeprecated).sort();
    expect(deprecated).toEqual(["veo:veo-3.1", "veo:veo-3.1-fast", "veo:veo-3.1-lite"]);
    expect(isDeprecated(videoModels().defaultId)).toBe(false);
  });

  it("contains the consolidated roster: Veo x3 + Kling 3.0 + Kling O1 + Kling 3.0 Omni + Seedance 2.5 + Gemini Omni", () => {
    expect(ids().sort()).toEqual([
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
    expect(ids()).not.toContain("openai:sora-2");
    expect(ids()).not.toContain("kling:kling-3-0-turbo");
    expect(ids()).not.toContain("kling:kling-2-6");
    expect(ids()).not.toContain("kling:kling-2-5-turbo");
  });

  it("excludes the legacy kling-v1/v2 endpoints", () => {
    expect(ids().some((id) => /kling-v(1|2)/.test(id))).toBe(false);
  });
});

describe("picker groups", () => {
  // Groups follow the catalog's sort order: Seedance sits between Kling and Google because its
  // row sorts right after the Kling rows.
  it("groups under Kling, Seedance, and Google — no OpenAI headers", () => {
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
    expect(DEFAULT_VIDEO_MODEL_ID).toBe(GEMINI_OMNI_MODEL_ID);
    expect(videoModels().defaultId).toBe(GEMINI_OMNI_MODEL_ID);
  });
});
