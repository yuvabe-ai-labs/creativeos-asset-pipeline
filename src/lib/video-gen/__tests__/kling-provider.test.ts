import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingRequestBody", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KLING_API_KEY = "test-key";
  });

  it("maps params to Kling API fields and never emits camera_control", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v3",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "a cat walking",
      params: { mode: "pro", duration: 5, cfg_scale: 0.5, negative_prompt: "blurry" },
      callbackUrl: "https://app.example.com/api/webhooks/generation?provider=kling",
    });

    expect(body.model_name).toBe("kling-v3");
    expect(body.mode).toBe("pro");
    expect(body.duration).toBe(5);
    expect(body.cfg_scale).toBe(0.5);
    expect(body.negative_prompt).toBe("blurry");
    expect(body.image).toBe("base64data");
    expect(body.callback_url).toBe("https://app.example.com/api/webhooks/generation?provider=kling");
    expect(body.camera_control).toBeUndefined();
    expect(body.aspect_ratio).toBeUndefined();
  });

  it("omits negative_prompt when empty", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v3",
      imageBase64: "x",
      mimeType: "image/jpeg",
      prompt: "steam drifts",
      params: { mode: "pro", duration: 5, cfg_scale: 0.5, negative_prompt: "" },
      callbackUrl: "https://app/cb",
    });
    expect(body.negative_prompt).toBeUndefined();
    expect(body.camera_control).toBeUndefined();
  });
});
