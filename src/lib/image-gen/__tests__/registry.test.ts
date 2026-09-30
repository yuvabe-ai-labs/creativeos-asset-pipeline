import { describe, it, expect } from "vitest";
import { imageGenRegistry, imageGenModelGroups, DEFAULT_MODEL_ID } from "../registry";
import { imageGenClientModels, imageGenClientModelGroups } from "../client-models";

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
