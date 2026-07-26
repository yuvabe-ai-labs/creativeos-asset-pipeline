import { describe, it, expect } from "vitest";
import { resolveVideoModelId, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "../client-models";

describe("resolveVideoModelId", () => {
  it("keeps a known model id", () => {
    expect(resolveVideoModelId("kling:kling-3-0")).toBe("kling:kling-3-0");
    expect(resolveVideoModelId("kling:kling-o1")).toBe("kling:kling-o1");
    expect(resolveVideoModelId("veo:veo-3.1-lite")).toBe("veo:veo-3.1-lite");
  });
  it("falls back to the default for a removed/unknown model id", () => {
    // kling-v3 was the consolidation-era default, never in the shipped roster
    expect(resolveVideoModelId("kling:kling-v3")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
    expect(resolveVideoModelId("kling:kling-v2-6")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
  });
  it("falls back for models pruned by the consolidation, so saved nodes still open", () => {
    for (const id of [
      "openai:sora-2",
      "kling:kling-3-0-turbo",
      "kling:kling-2-6",
      "kling:kling-2-5-turbo",
    ]) {
      expect(resolveVideoModelId(id)).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
    }
  });
});
