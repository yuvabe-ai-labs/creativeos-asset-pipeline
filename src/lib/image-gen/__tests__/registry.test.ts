import { describe, it, expect } from "vitest";
import { imageGenRegistry, imageGenModelGroups } from "../registry";

const EXPECTED_IDS = [
  "openai:gpt-image-2",
  "openai:gpt-image-1",
  "openai:gpt-image-1-mini",
  "gemini:gemini-2.5-flash-image",
  "gemini:gemini-3.1-flash-image",
  "gemini:gemini-3-pro-image",
];

describe("imageGenRegistry", () => {
  it("contains all 6 expected models", () => {
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
  });
});
