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

// The exact failure from a real run: the task was CREATED and left `running` at the vendor, then
// one `TypeError: fetch failed` on a poll threw out of the loop and abandoned it. BytePlus kept
// generating and kept billing; the operator got a stack trace and no video.
describe("pollSeedanceTask — transient network failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.BYTEPLUS_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const created = { ok: true, text: async () => JSON.stringify({ id: "cgt-abc" }) };
  const succeeded = {
    ok: true,
    json: async () => ({ status: "succeeded", content: { video_url: "https://v/out.mp4" }, duration: 8 }),
  };

  it("retries a bare `fetch failed` and still returns the video", async () => {
    mockFetch
      .mockResolvedValueOnce(created)
      .mockRejectedValueOnce(new TypeError("fetch failed")) // the blip that used to be fatal
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(succeeded);

    const { seedance25 } = await import("../providers/seedance");
    const p = seedance25.generate({
      prompt: "a cat", referenceUrls: [], params: { duration: 8, resolution: "480p", ratio: "9:16" },
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ videoUrl: "https://v/out.mp4" });
  });

  it("retries a 429 and a 502, which are the server asking us to come back", async () => {
    mockFetch
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce(succeeded);

    const { seedance25 } = await import("../providers/seedance");
    const p = seedance25.generate({
      prompt: "a cat", referenceUrls: [], params: { duration: 8, resolution: "480p", ratio: "9:16" },
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ videoUrl: "https://v/out.mp4" });
  });

  // A 4xx is us being wrong, not the server being busy — retrying ten times would just delay a
  // failure that is never going to resolve itself.
  it("does NOT retry a 404", async () => {
    mockFetch.mockResolvedValueOnce(created).mockResolvedValue({ ok: false, status: 404 });

    const { seedance25 } = await import("../providers/seedance");
    const p = seedance25.generate({
      prompt: "a cat", referenceUrls: [], params: { duration: 8, resolution: "480p", ratio: "9:16" },
    });
    const assertion = expect(p).rejects.toThrow(/404/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  // Giving up eventually still has to happen — and the message must say the task may still be
  // running, because it usually is.
  it("gives up after a run of failures and says the task may still be running", async () => {
    mockFetch.mockResolvedValueOnce(created).mockRejectedValue(new TypeError("fetch failed"));

    const { seedance25 } = await import("../providers/seedance");
    const p = seedance25.generate({
      prompt: "a cat", referenceUrls: [], params: { duration: 8, resolution: "480p", ratio: "9:16" },
    });
    const assertion = expect(p).rejects.toThrow(/may still be running/i);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
