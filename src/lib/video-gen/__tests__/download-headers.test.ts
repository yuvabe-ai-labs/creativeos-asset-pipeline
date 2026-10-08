import { describe, it, expect, afterEach } from "vitest";
import { videoDownloadHeaders } from "../download-headers";

afterEach(() => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("videoDownloadHeaders", () => {
  it("adds the Google key for Veo and Gemini", () => {
    process.env.GOOGLE_GENAI_API_KEY = "g";
    expect(videoDownloadHeaders("veo:veo-3")["x-goog-api-key"]).toBe("g");
    expect(videoDownloadHeaders("gemini:omni-flash")["x-goog-api-key"]).toBe("g");
  });

  it("adds a bearer token for OpenAI", () => {
    process.env.OPENAI_API_KEY = "o";
    expect(videoDownloadHeaders("openai:sora-2").Authorization).toBe("Bearer o");
  });

  it("sends only the user agent for other providers", () => {
    expect(videoDownloadHeaders("kling:kling-o1")).toEqual({
      "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)",
    });
    expect(videoDownloadHeaders(null)).toEqual({
      "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)",
    });
  });
});
