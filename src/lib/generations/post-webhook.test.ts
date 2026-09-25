import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "./post-webhook";

beforeEach(() => { process.env.APP_URL = "https://app.example"; process.env.TRIGGER_WEBHOOK_SECRET = "s"; });
afterEach(() => vi.restoreAllMocks());

describe("assertWebhookConfig", () => {
  it("throws when APP_URL is unset", () => {
    delete process.env.APP_URL;
    expect(() => assertWebhookConfig()).toThrow("APP_URL env var not set");
  });

  it("throws when TRIGGER_WEBHOOK_SECRET is unset", () => {
    delete process.env.TRIGGER_WEBHOOK_SECRET;
    expect(() => assertWebhookConfig()).toThrow("TRIGGER_WEBHOOK_SECRET env var not set");
  });
});

describe("postGenerationWebhook", () => {
  it("posts JSON with the bearer secret to /api/webhooks/generation", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await postGenerationWebhook({ generationId: "g", status: "failed", error: "x" });
    expect(f).toHaveBeenCalledWith("https://app.example/api/webhooks/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer s" },
      body: JSON.stringify({ generationId: "g", status: "failed", error: "x" }),
    });
  });

  it("the safe variant never throws on a transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(postGenerationWebhookSafely({ generationId: "g" }, "test")).resolves.toBeUndefined();
  });
});
