import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SEEDREAM_LITE,
  SEEDREAM_PRO,
  buildSeedreamRequest,
  generateWithSeedream,
} from "../seedream";
import type { ImageGenInput } from "../../types";

function input(overrides: Partial<ImageGenInput> = {}): ImageGenInput {
  return {
    prompt: "a bottle on ice",
    referenceUrls: [],
    params: { aspect_ratio: "9:16", image_size: "2K" },
    ...overrides,
  };
}

describe("buildSeedreamRequest", () => {
  it("sends the vendor model, explicit pixels, png, base64 and no watermark", () => {
    const body = buildSeedreamRequest(SEEDREAM_PRO, input());
    expect(body).toEqual({
      model: "dola-seedream-5-0-pro-260628",
      prompt: "a bottle on ice",
      size: "1584x2816",
      output_format: "png",
      response_format: "b64_json",
      watermark: false,
    });
  });

  it("disables batch output on Lite only — Pro rejects the field", () => {
    expect(buildSeedreamRequest(SEEDREAM_LITE, input()).sequential_image_generation).toBe("disabled");
    expect(buildSeedreamRequest(SEEDREAM_PRO, input())).not.toHaveProperty("sequential_image_generation");
  });

  it("uses Lite's own size table", () => {
    expect(buildSeedreamRequest(SEEDREAM_LITE, input()).size).toBe("1600x2848");
  });

  it("sends one reference as a string, several as an array, none as absent", () => {
    expect(buildSeedreamRequest(SEEDREAM_LITE, input())).not.toHaveProperty("image");
    expect(buildSeedreamRequest(SEEDREAM_LITE, input({ referenceUrls: ["https://a"] })).image).toBe("https://a");
    expect(
      buildSeedreamRequest(SEEDREAM_LITE, input({ referenceUrls: ["https://a", "https://b"] })).image,
    ).toEqual(["https://a", "https://b"]);
  });
});

describe("generateWithSeedream", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BYTEPLUS_API_KEY", "test-key");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function respond(status: number, body: unknown) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it("returns the image, the token usage and the exact charge", async () => {
    respond(200, { data: [{ b64_json: "AAAA" }], usage: { output_tokens: 16000, total_tokens: 16000 } });
    const result = await generateWithSeedream(SEEDREAM_PRO, input({ referenceUrls: ["https://a", "https://b", "https://c"] }));

    expect(result.imageBase64).toBe("AAAA");
    expect(result.mimeType).toBe("image/png");
    expect(result.tokensUsed.image_output_tokens).toBe(16000);
    // Pro 2K $0.09 + 2 extra references x $0.003.
    expect(result.costUsd).toBeCloseTo(0.096, 6);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations");
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("charges Lite a flat price whatever the references", async () => {
    respond(200, { data: [{ b64_json: "AAAA" }] });
    const result = await generateWithSeedream(
      SEEDREAM_LITE,
      input({ params: { aspect_ratio: "1:1", image_size: "4K" }, referenceUrls: ["https://a", "https://b"] }),
    );
    expect(result.costUsd).toBeCloseTo(0.035, 6);
    expect(result.tokensUsed.total_tokens).toBe(0);
  });

  it("surfaces the vendor's error message verbatim", async () => {
    respond(404, { error: { code: "ModelNotOpen", message: "Your account has not activated the model." } });
    await expect(generateWithSeedream(SEEDREAM_PRO, input())).rejects.toThrow(
      "Seedream request failed (404): Your account has not activated the model.",
    );
  });

  it("surfaces a per-image error", async () => {
    respond(200, { data: [{ error: { code: "OutputImageSensitiveContentDetected", message: "sensitive content" } }] });
    await expect(generateWithSeedream(SEEDREAM_PRO, input())).rejects.toThrow(/sensitive content/);
  });

  it("fails when no image comes back", async () => {
    respond(200, { data: [] });
    await expect(generateWithSeedream(SEEDREAM_PRO, input())).rejects.toThrow("Seedream returned no image");
  });

  it("reports a non-JSON failure with its status", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    await expect(generateWithSeedream(SEEDREAM_PRO, input())).rejects.toThrow("Seedream request failed (502): Bad Gateway");
  });

  it("names the missing key before calling the vendor", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    await expect(generateWithSeedream(SEEDREAM_PRO, input())).rejects.toThrow(/BYTEPLUS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
