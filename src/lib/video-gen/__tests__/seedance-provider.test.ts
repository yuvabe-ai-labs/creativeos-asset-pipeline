import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Static, unlike the `generate` tests below: `explainSeedanceError` is a pure function of a status
// and a response body, so it needs neither the fetch stub nor a re-import after env changes.
import { explainSeedanceError } from "../providers/seedance";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createSeedanceTask error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BYTEPLUS_API_KEY = "test-key";
  });

  it("surfaces HTTP status when response is non-JSON (e.g., gateway timeout HTML)", async () => {
    // Simulate a gateway timeout returning an HTML error page instead of JSON
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "<html><body>Bad Gateway</body></html>",
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    const { seedance25 } = await import("../providers/seedance");
    const resultPromise = seedance25.generate({
      prompt: "test prompt",
      referenceUrls: [],
      params: {},
    });

    await expect(resultPromise).rejects.toThrow(/502/);
  });

  it("preserves vendor error message when JSON parsing succeeds but no id is returned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ error: { message: "Model not available" } }),
      json: async () => ({ error: { message: "Model not available" } }),
    });

    const { seedance25 } = await import("../providers/seedance");
    const resultPromise = seedance25.generate({
      prompt: "test prompt",
      referenceUrls: [],
      params: {},
    });

    await expect(resultPromise).rejects.toThrow("Model not available");
  });

  it("returns task id on successful JSON response with id field", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "task-12345" }),
        json: async () => ({ id: "task-12345" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: "succeeded", content: { video_url: "https://example.com/video.mp4" }, duration: 5 }),
        json: async () => ({
          status: "succeeded",
          content: { video_url: "https://example.com/video.mp4" },
          duration: 5,
        }),
      });

    const { seedance25 } = await import("../providers/seedance");
    const resultPromise = seedance25.generate({
      prompt: "test prompt",
      referenceUrls: [],
      params: {},
    });

    // Advance past the poll delay
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();

    const result = await resultPromise;
    expect(result.videoUrl).toBe("https://example.com/video.mp4");
    expect(result.durationSeconds).toBe(5);
  });
});

// The real 400 an operator hit on the first live generation. Seedance refuses ANY reference image
// containing a real human face — a hard vendor rule, not a borderline moderation call — and the
// raw body names `content[1]`/`content[3]`, request-array positions that mean nothing to someone
// looking at named thumbnails.
describe("explainSeedanceError — real-person references", () => {
  const REAL_400 = JSON.stringify({
    error: {
      code: "InputImageSensitiveContentDetected.PrivacyInformation",
      message:
        "The request failed because the input image 'content[1]' 'content[3]' may contain real person. Request id: 0217889771718",
      param: "",
      type: "BadRequest",
    },
  });

  it("translates content[N] into the Nth attached image", () => {
    const msg = explainSeedanceError(400, REAL_400);
    // content[0] is the prompt, so these are references #1 and #3 — not #0 and #2.
    expect(msg).toContain("Reference images #1, #3");
    expect(msg).not.toContain("content[");
  });

  it("says retrying will not help, because the rule is absolute", () => {
    expect(explainSeedanceError(400, REAL_400)).toMatch(/retrying will not help/i);
  });

  it("names a route out rather than only refusing", () => {
    const msg = explainSeedanceError(400, REAL_400);
    expect(msg).toMatch(/digital-character library/i);
    expect(msg).toMatch(/Gemini Omni or Kling/);
  });

  // Every other vendor error is the real diagnosis and must survive verbatim — do not paraphrase
  // errors we have not specifically studied.
  it("passes an unrecognised vendor error through untouched", () => {
    const other = JSON.stringify({ error: { code: "QuotaExceeded", message: "no quota left" } });
    expect(explainSeedanceError(429, other)).toContain("no quota left");
  });

  it("falls back to the raw body when it is not JSON at all", () => {
    expect(explainSeedanceError(502, "<html>gateway timeout</html>")).toContain("502");
  });
});
