import { describe, it, expect } from "vitest";
import { resolveVideoModelId, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "../client-models";

describe("resolveVideoModelId", () => {
  it("keeps a known model id", () => {
    expect(resolveVideoModelId("kling:kling-v3")).toBe("kling:kling-v3");
  });
  it("falls back to the default for a removed model id", () => {
    expect(resolveVideoModelId("openai:sora-2")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
    expect(resolveVideoModelId("kling:kling-v2-6")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
  });
});
