import { describe, it, expect } from "vitest";
import { imageGenRegistry, imageGenModelGroups, DEFAULT_MODEL_ID } from "../registry";
import {
  imageGenClientModels,
  imageGenClientModelGroups,
  imageGenClientModelMap,
  defaultsForModel,
  isImageModelDeprecated,
  withoutDeprecatedImageModel,
  DEPRECATED_IMAGE_MODEL_FALLBACK_ID,
} from "../client-models";

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

describe("imageGenRegistry", () => {
  it("contains all 8 expected models", () => {
    for (const id of EXPECTED_IDS) {
      expect(imageGenRegistry[id], `missing model: ${id}`).toBeDefined();
    }
  });

  it("each model has a valid Zod schema with defaults", () => {
    for (const [id, config] of Object.entries(imageGenRegistry)) {
      expect(() => config.schema.parse({}), `schema.parse({}) threw for ${id}`).not.toThrow();
    }
  });

  it("each model has a generate function", () => {
    for (const [id, config] of Object.entries(imageGenRegistry)) {
      expect(typeof config.generate, `generate is not a function for ${id}`).toBe("function");
    }
  });

  it("model groups cover all models", () => {
    const groupIds = imageGenModelGroups.flatMap((g) => g.models.map((m) => m.id));
    for (const id of EXPECTED_IDS) {
      expect(groupIds, `${id} missing from groups`).toContain(id);
    }
  });

  it("supportsMask is true for OpenAI gpt-image models and falsy for Gemini", () => {
    expect(imageGenRegistry["openai:gpt-image-2"].supportsMask).toBe(true);
    expect(imageGenRegistry["openai:gpt-image-1"].supportsMask).toBe(true);
    expect(imageGenRegistry["openai:gpt-image-1-mini"].supportsMask).toBe(true);
    expect(imageGenRegistry["gemini:gemini-2.5-flash-image"].supportsMask ?? false).toBe(false);
    expect(imageGenRegistry["gemini:gemini-3-pro-image"].supportsMask ?? false).toBe(false);
    expect(imageGenRegistry["seedream:seedream-5-0-lite"].supportsMask).toBe(false);
    expect(imageGenRegistry["seedream:seedream-5-0-pro"].supportsMask).toBe(false);
  });

  it("groups Seedream after Gemini and leaves the default model alone", () => {
    expect(imageGenModelGroups.map((g) => g.provider)).toEqual(["openai", "gemini", "seedream"]);
    expect(DEFAULT_MODEL_ID).toBe("gemini:gemini-3-pro-image");
  });

  it("the client model list mirrors the server registry", () => {
    // The two lists are hand-kept side by side; a field drifting between them would show a limit
    // in the UI that the server does not enforce, or the reverse.
    for (const client of imageGenClientModels) {
      const server = imageGenRegistry[client.id];
      expect(server, `client model ${client.id} missing on the server`).toBeDefined();
      expect(client.params).toBe(server.params);
      expect(client.maxReferenceImages).toBe(server.maxReferenceImages);
      expect(client.maxReferenceSizeBytes).toBe(server.maxReferenceSizeBytes);
      expect(client.supportsMask ?? false).toBe(server.supportsMask ?? false);
    }
    expect(imageGenClientModelGroups.map((g) => g.provider)).toEqual(["openai", "gemini", "seedream"]);
  });
});

describe("deprecated image models (D467)", () => {
  const SUNBURST = "openai:gpt-image-2.5-sunburst";

  it("deprecates GPT Image 1 only, and leaves Mini on offer", () => {
    expect(imageGenClientModels.filter((m) => m.deprecated).map((m) => m.id)).toEqual(["openai:gpt-image-1"]);
    const offered = imageGenClientModelGroups.flatMap((g) => g.models.map((m) => m.id));
    expect(offered).not.toContain("openai:gpt-image-1");
    expect(offered).toContain("openai:gpt-image-1-mini");
  });

  it("falls back to a model that is on offer", () => {
    expect(DEPRECATED_IMAGE_MODEL_FALLBACK_ID).toBe(SUNBURST);
    expect(isImageModelDeprecated(DEPRECATED_IMAGE_MODEL_FALLBACK_ID)).toBe(false);
  });

  it("moves a deprecated model to Sunburst with Sunburst's default params, dropping the old ones", () => {
    const next = withoutDeprecatedImageModel({
      title: "Hero",
      modelId: "openai:gpt-image-1",
      params: { aspect_ratio: "16:9", quality: "high", background: "transparent" },
    });
    expect(next.title).toBe("Hero");
    expect(next.modelId).toBe(SUNBURST);
    expect(next.params).toEqual(defaultsForModel(imageGenClientModelMap[SUNBURST]));
  });

  it("returns any other node's data as the same object", () => {
    const data = { modelId: "openai:gpt-image-1-mini", params: { quality: "low" } };
    expect(withoutDeprecatedImageModel(data)).toBe(data);
    const noModel = { modelId: undefined, title: "Image" };
    expect(withoutDeprecatedImageModel(noModel)).toBe(noModel);
  });
});
