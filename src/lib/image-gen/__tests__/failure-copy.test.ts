import { describe, it, expect } from "vitest";
import {
  CREDIT_LIMIT_MESSAGE,
  IMAGE_GENERATION_FAILED_MESSAGE,
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
