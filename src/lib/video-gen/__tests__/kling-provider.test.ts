import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingRequestBody", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KLING_API_KEY = "test-key";
  });

  it("maps params to correct Kling API fields", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "a cat walking",
      params: {
        mode: "pro",
        duration: "5",
        aspect_ratio: "16:9",
        cfg_scale: 0.5,
        negative_prompt: "",
        pan: 0,
        tilt: 0,
        zoom: 0,
        roll: 0,
        horizontal_movement: 0,
        vertical_movement: 0,
      },
      callbackUrl: "https://app.example.com/api/webhooks/generation?provider=kling",
    });

    expect(body.model_name).toBe("kling-v1-5");
    expect(body.mode).toBe("pro");
    expect(body.duration).toBe(5);
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.cfg_scale).toBe(0.5);
    expect(body.callback_url).toBe("https://app.example.com/api/webhooks/generation?provider=kling");
    expect(body.image).toBe("base64data");
  });

  it("omits camera motion params when all are zero", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "test",
      params: { mode: "pro", duration: "5", aspect_ratio: "16:9", cfg_scale: 0.5,
        negative_prompt: "", pan: 0, tilt: 0, zoom: 0, roll: 0,
        horizontal_movement: 0, vertical_movement: 0 },
      callbackUrl: "https://example.com/webhook",
    });
    expect(body.camera_control).toBeUndefined();
  });

  it("includes camera_control when any motion param is non-zero", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "test",
      params: { mode: "pro", duration: "5", aspect_ratio: "16:9", cfg_scale: 0.5,
        negative_prompt: "", pan: 3, tilt: 0, zoom: 0, roll: 0,
        horizontal_movement: 0, vertical_movement: 0 },
      callbackUrl: "https://example.com/webhook",
    });
    expect(body.camera_control).toEqual({ type: "customize", config: { pan: 3, tilt: 0, zoom: 0, roll: 0, horizontal: 0, vertical: 0 } });
  });

  const cameraBase = {
    modelName: "kling-v2-6",
    imageBase64: "x",
    mimeType: "image/jpeg",
    prompt: "steam drifts",
    callbackUrl: "https://app/cb",
  };

  it("maps a camera_move to camera_control", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({ ...cameraBase, params: { camera_move: "push-in" } });
    expect(body.camera_control).toEqual({ type: "customize", config: expect.objectContaining({ zoom: 5 }) });
  });

  it("maps orbit to the turn preset", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({ ...cameraBase, params: { camera_move: "orbit" } });
    expect(body.camera_control).toEqual({ type: "left_turn_forward" });
  });

  it("omits camera_control for static", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({ ...cameraBase, params: { camera_move: "static" } });
    expect(body.camera_control).toBeUndefined();
  });

  it("custom mode uses the axis sliders (legacy path)", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({ ...cameraBase, params: { camera_move: "custom", zoom: 3 } });
    expect(body.camera_control).toEqual({ type: "customize", config: expect.objectContaining({ zoom: 3 }) });
  });
});
