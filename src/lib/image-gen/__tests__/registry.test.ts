import { describe, it, expect } from "vitest";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";
import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/ai-models/default-models";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const images = () => imageModelsFrom(seededModelCatalog());

const EXPECTED_IDS = [
  "openai:gpt-image-2",
  "openai:gpt-image-1",
  "openai:gpt-image-1-mini",
  "gemini:gemini-2.5-flash-image",
  "gemini:gemini-3.1-flash-image",
  "gemini:gemini-3-pro-image",
  "seedream:seedream-5-0-lite",
  "seedream:seedream-5-0-pro",
];

describe("seeded image models", () => {
  it("contains all 8 expected models", () => {
    for (const id of EXPECTED_IDS) {
      expect(images().get(id), `missing model: ${id}`).toBeDefined();
    }
  });

  it("each model has a valid Zod schema with defaults", () => {
    for (const spec of images().all) {
      expect(() => spec.schema.parse({}), `schema.parse({}) threw for ${spec.id}`).not.toThrow();
    }
  });

  it("model groups cover every model on offer", () => {
    const groupIds = images().groups().flatMap((g) => g.models.map((m) => m.id));
    for (const id of EXPECTED_IDS.filter((id) => id !== "openai:gpt-image-1")) {
      expect(groupIds, `${id} missing from groups`).toContain(id);
    }
  });

  it("supportsMask is true for OpenAI gpt-image models and falsy for Gemini", () => {
    const spec = (id: string) => images().get(id)!;
    expect(spec("openai:gpt-image-2").supportsMask).toBe(true);
    expect(spec("openai:gpt-image-1").supportsMask).toBe(true);
    expect(spec("openai:gpt-image-1-mini").supportsMask).toBe(true);
    expect(spec("gemini:gemini-2.5-flash-image").supportsMask ?? false).toBe(false);
    expect(spec("gemini:gemini-3-pro-image").supportsMask ?? false).toBe(false);
    expect(spec("seedream:seedream-5-0-lite").supportsMask).toBe(false);
    expect(spec("seedream:seedream-5-0-pro").supportsMask).toBe(false);
  });

  it("groups Seedream after Gemini and leaves the default model alone", () => {
    expect(images().groups().map((g) => g.provider)).toEqual(["openai", "gemini", "seedream"]);
    expect(DEFAULT_IMAGE_MODEL_ID).toBe("gemini:gemini-3-pro-image");
    expect(images().defaultId).toBe("gemini:gemini-3-pro-image");
  });
});

describe("deprecated image models (D467)", () => {
  const SUNBURST = "openai:gpt-image-2.5-sunburst";

  it("deprecates GPT Image 1 only, and leaves Mini on offer", () => {
    expect(images().all.filter((m) => images().status(m.id) === "retired").map((m) => m.id)).toEqual(["openai:gpt-image-1"]);
    const offered = images().groups().flatMap((g) => g.models.map((m) => m.id));
    expect(offered).not.toContain("openai:gpt-image-1");
    expect(offered).toContain("openai:gpt-image-1-mini");
  });

  it("falls back to a model that is on offer", () => {
    expect(images().replacedBy("openai:gpt-image-1")).toBe(SUNBURST);
        expect(images().status(SUNBURST)).toBe("live");
  });
});
