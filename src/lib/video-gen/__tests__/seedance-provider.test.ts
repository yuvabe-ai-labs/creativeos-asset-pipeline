import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
