import { describe, it, expect } from "vitest";
import { resolveVideoModelId, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "../client-models";

describe("resolveVideoModelId", () => {
  it("keeps a known model id (union roster)", () => {
    expect(resolveVideoModelId("kling:kling-3-0")).toBe("kling:kling-3-0");
    expect(resolveVideoModelId("openai:sora-2")).toBe("openai:sora-2");
  });
  it("falls back to the default for a removed/unknown model id", () => {
    // kling-v3 was the consolidation-era default, not in the integrated roster
    expect(resolveVideoModelId("kling:kling-v3")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
    expect(resolveVideoModelId("kling:kling-v2-6")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
  });
});
