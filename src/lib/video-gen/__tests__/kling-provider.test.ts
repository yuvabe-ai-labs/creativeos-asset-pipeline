import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingContents", () => {
  it("includes prompt and first_frame when startFrameUrl is given", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
    ]);
  });

  it("includes last_frame when endFrameUrl is given", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      endFrameUrl: "https://x.test/end.png",
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
      { type: "last_frame", url: "https://x.test/end.png" },
    ]);
  });

  it("omits last_frame when endFrameUrl is absent", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
    });
    expect(contents.some((c) => c.type === "last_frame")).toBe(false);
  });

  // `id` is how the prompt addresses an image (@image_1). Kling's omni docs ship a worked
  // first_frame + refer_image example, so the two genuinely coexist.
  it("emits refer_image items with 1-indexed ids after the frames", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      endFrameUrl: "https://x.test/end.png",
      referenceUrls: ["https://x.test/r1.png", "https://x.test/r2.png"],
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
      { type: "last_frame", url: "https://x.test/end.png" },
      { type: "refer_image", url: "https://x.test/r1.png", id: "image_1" },
      { type: "refer_image", url: "https://x.test/r2.png", id: "image_2" },
    ]);
  });

  it("emits no refer_image items when referenceUrls is empty or absent", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    for (const input of [
      { prompt: "p", startFrameUrl: "https://x.test/s.png" },
      { prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [] },
    ]) {
      const contents = buildKlingContents(input);
      expect(contents.some((c) => c.type === "refer_image")).toBe(false);
    }
  });
});

describe("per-model settings builders", () => {
  it("build3_0Settings includes multi_shot and audio", async () => {
    const { build3_0Settings } = await import("../providers/kling");
    expect(
      build3_0Settings({
        resolution: "4k",
        duration: "15",
        audio: "native",
        multi_shot: false,
      }),
    ).toEqual({ multi_shot: false, audio: "native", resolution: "4k", duration: 15 });
  });

  it("buildO1Settings uses the original/off audio enum", async () => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(
      buildO1Settings({ resolution: "1080p", duration: "10", audio: "original" }),
    ).toEqual({ audio: "original", resolution: "1080p", duration: 10 });
  });

  // The param is snake_case for Kling (Veo's SDK takes camelCase `negativePrompt`), and is
  // omitted entirely when blank so an emptied box sends no negative at all.
  it("threads negative_prompt into both surviving models' settings", async () => {
    const { build3_0Settings, buildO1Settings } = await import("../providers/kling");
    expect(build3_0Settings({ negative_prompt: "blurry, warped label" })).toMatchObject({
      negative_prompt: "blurry, warped label",
    });
    expect(buildO1Settings({ negative_prompt: "blurry, warped label" })).toMatchObject({
      negative_prompt: "blurry, warped label",
    });
  });

  it("omits negative_prompt when absent, empty, or whitespace", async () => {
    const { build3_0Settings, buildO1Settings } = await import("../providers/kling");
    for (const params of [{}, { negative_prompt: "" }, { negative_prompt: "   " }]) {
      expect(build3_0Settings(params)).not.toHaveProperty("negative_prompt");
      expect(buildO1Settings(params)).not.toHaveProperty("negative_prompt");
    }
  });
});

describe("kling30.generate — poll flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.KLING_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts to the correct endpoint, polls until succeeded, returns video result", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: { id: "task123", status: "submitted" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [{ id: "task123", status: "processing" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [
            {
              id: "task123",
              status: "succeeded",
              outputs: [{ type: "video", url: "https://cdn.test/video.mp4", duration: "5" }],
            },
          ],
        }),
      });

    const { kling30 } = await import("../providers/kling");
    const resultPromise = kling30.generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: [],
      params: { resolution: "720p", duration: "5" },
    });

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({
      videoUrl: "https://cdn.test/video.mp4",
      durationSeconds: 5,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const createCall = mockFetch.mock.calls[0];
    expect(createCall[0]).toBe("https://api-singapore.klingai.com/image-to-video/kling-3.0");
    const pollCall = mockFetch.mock.calls[1];
    expect(pollCall[0]).toBe("https://api-singapore.klingai.com/tasks?task_ids=task123");
  });

  it("throws with the failure message when task status is failed", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: { id: "task123", status: "submitted" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [{ id: "task123", status: "failed", message: "NSFW content detected" }],
        }),
      });

    const { kling30 } = await import("../providers/kling");
    const resultPromise = kling30.generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: [],
      params: {},
    });

    const assertion = expect(resultPromise).rejects.toThrow("NSFW content detected");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("throws immediately when no start frame is provided", async () => {
    const { kling30 } = await import("../providers/kling");
    await expect(
      kling30.generate({ prompt: "a cat walking", referenceUrls: [], params: {} }),
    ).rejects.toThrow("requires a start frame");
  });
});

// /image-to-video/kling-3.0 has no refer_image content type — its enum is prompt, first_frame,
// last_frame, element. Sending one would be an unsupported type, so 3.0 drops references
// rather than forwarding them.
describe("reference images are omni-only", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.KLING_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drives one generate() to a failed poll (so nothing hangs) and returns the create payload. */
  async function capturePayload(
    generate: (input: {
      prompt: string;
      startFrameUrl: string;
      referenceUrls: string[];
      params: Record<string, unknown>;
    }) => Promise<unknown>,
  ) {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, message: "", data: { id: "t1", status: "submitted" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [{ id: "t1", status: "failed", message: "halt" }],
        }),
      });

    const pending = generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: ["https://x.test/r1.png", "https://x.test/r2.png"],
      params: {},
    });
    const assertion = expect(pending).rejects.toThrow("halt");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    const init = mockFetch.mock.calls[0][1] as { body: string };
    return JSON.parse(init.body) as { contents: Array<{ type: string }> };
  }

  it("kling30 drops referenceUrls", async () => {
    const { kling30 } = await import("../providers/kling");
    const body = await capturePayload(kling30.generate);
    expect(body.contents.some((c) => c.type === "refer_image")).toBe(false);
    expect(body.contents.some((c) => c.type === "first_frame")).toBe(true);
  });

  it("klingO1 forwards referenceUrls as refer_image alongside the first frame", async () => {
    const { klingO1 } = await import("../providers/kling");
    const body = await capturePayload(klingO1.generate);
    expect(body.contents.filter((c) => c.type === "refer_image")).toHaveLength(2);
    expect(body.contents.some((c) => c.type === "first_frame")).toBe(true);
  });
});
