import { describe, it, expect } from "vitest";
import {
  CREDIT_LIMIT_MESSAGE,
  IMAGE_GENERATION_FAILED_MESSAGE,
  IMAGE_MODEL_BUSY_MESSAGE,
  IMAGE_MODEL_UNAVAILABLE_MESSAGE,
  IMAGE_PROMPT_DECLINED_MESSAGE,
  START_FAILED_MESSAGE,
  isImageStartFailure,
  plainImageFailure,
} from "../failure-copy";

describe("plainImageFailure (D366)", () => {
  it("names a refused prompt plainly, whichever provider refused it", () => {
    expect(plainImageFailure("400 Your request was rejected as a result of our safety system.")).toBe(
      IMAGE_PROMPT_DECLINED_MESSAGE,
    );
    expect(plainImageFailure("moderation_blocked")).toBe(IMAGE_PROMPT_DECLINED_MESSAGE);
    expect(plainImageFailure("Seedream could not generate the image: OutputImageSensitiveContentDetected")).toBe(
      IMAGE_PROMPT_DECLINED_MESSAGE,
    );
  });

  it("says the model's spending limit is reached when the provider account is out of quota or spend", () => {
    for (const raw of [
      '{"error":{"code":429,"message":"Your project has exceeded its monthly spending cap. Please go to AI Studio","status":"RESOURCE_EXHAUSTED"}}',
      "429 You exceeded your current quota, please check your plan and billing details.",
      "insufficient_quota",
      "Your account has an overdue balance (AccountOverdueError)",
    ]) {
      expect(plainImageFailure(raw)).toBe(IMAGE_MODEL_UNAVAILABLE_MESSAGE);
    }
  });

  it("says the model is busy when the provider only rate-limits", () => {
    for (const raw of [
      "429 Rate limit reached for gpt-image-1 in organization org-x on images per min.",
      "Too Many Requests",
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Resource has been exhausted (e.g. check quota)."}}',
    ]) {
      expect(plainImageFailure(raw)).toBe(IMAGE_MODEL_BUSY_MESSAGE);
    }
  });

  it("keeps the plain messages free of vendor names", () => {
    for (const m of [IMAGE_MODEL_UNAVAILABLE_MESSAGE, IMAGE_MODEL_BUSY_MESSAGE]) {
      expect(m).not.toMatch(/gemini|openai|google|seedream|byteplus|quota|429/i);
    }
  });

  it("never passes internals through", () => {
    for (const raw of [
      "Missing OPENAI_API_KEY in .env.local",
      "Image generated but the webhook rejected it (500) — imageUrl=https://storage.googleapis.com/b/g1.png",
      "Gemini returned no image in response",
    ]) {
      expect(plainImageFailure(raw)).toBe(IMAGE_GENERATION_FAILED_MESSAGE);
    }
  });
});

describe("isImageStartFailure", () => {
  it("recognises only the messages a start request reports itself", () => {
    expect(isImageStartFailure(START_FAILED_MESSAGE)).toBe(true);
    expect(isImageStartFailure(CREDIT_LIMIT_MESSAGE)).toBe(true);
    expect(isImageStartFailure(IMAGE_GENERATION_FAILED_MESSAGE)).toBe(false);
    expect(isImageStartFailure(null)).toBe(false);
  });
});
