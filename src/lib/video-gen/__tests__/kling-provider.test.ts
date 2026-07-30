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

  // Kling: 400 code 1201 "Duration only supports 5 or 10 seconds when no refer_image is
  // provided". We never send refer_image, so anything else must be clamped before it ships —
  // a node saved while the param spec still offered 3–10 would otherwise fail every generate.
  it.each([3, 4, 6, 7, 8, 9, 15, 0])(
    "buildO1Settings clamps the illegal duration %i to 5",
    async (duration) => {
      const { buildO1Settings } = await import("../providers/kling");
      expect(buildO1Settings({ duration }).duration).toBe(5);
    },
  );

  it.each([5, 10, "5", "10"])(
    "buildO1Settings passes the legal duration %s through unchanged",
    async (duration) => {
      const { buildO1Settings } = await import("../providers/kling");
      expect(buildO1Settings({ duration }).duration).toBe(Number(duration));
    },
  );

  // Verified against the official /image-to-video/kling-3.0 docs: settings.duration enumerates
  // 3–15 with no refer_image caveat, unlike O1. The two models genuinely differ — do not
  // "consolidate" this by applying O1's clamp here.
  it("build3_0Settings does NOT clamp — 3.0 genuinely accepts 3–15", async () => {
    const { build3_0Settings } = await import("../providers/kling");
    expect(build3_0Settings({ duration: 7 }).duration).toBe(7);
  });

  // Kling defaults multi_shot to TRUE server-side, so leaving the field out of the body — as
  // this builder originally did — silently opted every O1 clip into multi-shot cuts.
  it("buildO1Settings always sends multi_shot, defaulting to false when unset", async () => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(buildO1Settings({}).multi_shot).toBe(false);
    expect(buildO1Settings({ multi_shot: true }).multi_shot).toBe(true);
  });

  // `original` retains a reference video's soundtrack and we never send a video, so a node
  // saved while it was the only audio-on option must carry over to native, not fall to silence.
  it("buildO1Settings maps the legacy original audio value to native", async () => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(buildO1Settings({ audio: "original" }).audio).toBe("native");
  });

  it.each([
    ["native", "native"],
    ["off", "off"],
    [undefined, "off"],
  ])("buildO1Settings resolves audio %s to %s", async (input, expected) => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(buildO1Settings({ audio: input }).audio).toBe(expected);
  });

  it("buildO1Settings builds a full body", async () => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(
      buildO1Settings({ resolution: "1080p", duration: "10", audio: "native" }),
    ).toEqual({ multi_shot: false, audio: "native", resolution: "1080p", duration: 10 });
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
