import { describe, it, expect } from "vitest";
import {
  omniDurationSeconds,
  buildOmniResponseFormat,
  buildOmniRequestBody,
  extractOmniVideoUri,
  fileNameFromUri,
} from "../providers/gemini-omni";

describe("omniDurationSeconds", () => {
  it("passes a valid duration through", () => {
    expect(omniDurationSeconds({ duration: 6 })).toBe(6);
  });

  // A node saved before a spec change still holds its old value and nothing re-validates params
  // on load, so an out-of-range duration must be clamped rather than sent.
  it("clamps to the 3-10 range", () => {
    expect(omniDurationSeconds({ duration: 15 })).toBe(10);
    expect(omniDurationSeconds({ duration: 1 })).toBe(3);
  });

  // Kling stores duration as a string, Veo as a number. A node switched between models can
  // arrive with either, so both must resolve to the same number.
  it("coerces a string duration", () => {
    expect(omniDurationSeconds({ duration: "8" })).toBe(8);
  });

  it("falls back to 8 for a missing or unparseable value", () => {
    expect(omniDurationSeconds({})).toBe(8);
    expect(omniDurationSeconds({ duration: "abc" })).toBe(8);
  });
});

describe("buildOmniResponseFormat", () => {
  // VERIFIED AGAINST THE LIVE API: duration is a STRING here, not an integer, and not in
  // video_config. The integer form returns 400 "Invalid input at 'response_format'".
  it("emits duration as a seconds string", () => {
    expect(buildOmniResponseFormat({ duration: 8 }).duration).toBe("8s");
    expect(buildOmniResponseFormat({ duration: 3 }).duration).toBe("3s");
  });

  it("always requests uri delivery and the video type", () => {
    const rf = buildOmniResponseFormat({});
    expect(rf.delivery).toBe("uri");
    expect(rf.type).toBe("video");
  });

  it("defaults resolution to 720p and rejects one this model does not offer", () => {
    expect(buildOmniResponseFormat({}).resolution).toBe("720p");
    expect(buildOmniResponseFormat({ resolution: "8k" }).resolution).toBe("720p");
    expect(buildOmniResponseFormat({ resolution: "360p" }).resolution).toBe("360p");
  });

  // Omni has no 1:1, unlike Kling O1 — a node switched from O1 can carry one.
  it("falls back to 16:9 for an unsupported aspect ratio", () => {
    expect(buildOmniResponseFormat({ aspect_ratio: "1:1" }).aspect_ratio).toBe("16:9");
    expect(buildOmniResponseFormat({ aspect_ratio: "9:16" }).aspect_ratio).toBe("9:16");
  });
});

describe("extractOmniVideoUri", () => {
  // VERIFIED: `output_video` does NOT exist on the REST response — it is an SDK-only convenience
  // field. The video lives in the model_output step.
  it("reads the video uri out of the model_output step", () => {
    const uri = extractOmniVideoUri({
      steps: [
        { type: "thought", content: [{ type: "thought" }] },
        { type: "model_output", content: [
          { type: "video", mime_type: "video/mp4", uri: "https://g/v1beta/files/abc:download?alt=media" },
        ] },
      ],
    });
    expect(uri).toBe("https://g/v1beta/files/abc:download?alt=media");
  });

  it("returns undefined when no video came back", () => {
    expect(extractOmniVideoUri({ steps: [{ type: "thought" }] })).toBeUndefined();
    expect(extractOmniVideoUri({})).toBeUndefined();
  });
});

describe("fileNameFromUri", () => {
  it("extracts the Files API resource name", () => {
    expect(fileNameFromUri("https://generativelanguage.googleapis.com/v1beta/files/u1jbms4c1zkl:download?alt=media"))
      .toBe("files/u1jbms4c1zkl");
  });

  it("returns undefined for a URI with no file segment", () => {
    expect(fileNameFromUri("https://example.com/video.mp4")).toBeUndefined();
  });
});

describe("buildOmniRequestBody", () => {
  const IMG = (n: string) => ({ type: "image", data: n, mime_type: "image/png" });

  // The image array order IS the contract — the @ImageN numbers in the generated prompt header
  // count this array from 1. A reorder here silently binds a mention to the wrong image, and
  // that is only visible in a generation already paid for.
  it("puts every image first in plan order and the text part last", () => {
    const body = buildOmniRequestBody({
      imageParts: [IMG("a"), IMG("b"), IMG("c")],
      text: "the prompt",
      task: "image_to_video",
      params: {},
    });
    expect(body.input).toEqual([
      IMG("a"), IMG("b"), IMG("c"),
      { type: "text", text: "the prompt" },
    ]);
  });

  it("sends only the text part when there are no images", () => {
    const body = buildOmniRequestBody({
      imageParts: [], text: "just words", task: "text_to_video", params: {},
    });
    expect(body.input).toEqual([{ type: "text", text: "just words" }]);
  });

  // VERIFIED: the API returns 400 "store=true is required when response format has video
  // delivery set to URI". Not a preference.
  it("always sets store true", () => {
    expect(buildOmniRequestBody({ imageParts: [], text: "x", task: "text_to_video", params: {} }).store)
      .toBe(true);
  });

  // VERIFIED: video_config rejects duration, resolution and aspect_ratio with 400
  // "Unknown parameter" — Google's published docs say otherwise and are wrong.
  it("puts task and nothing else in video_config", () => {
    const body = buildOmniRequestBody({
      imageParts: [], text: "x", task: "reference_to_video",
      params: { duration: 8, resolution: "1080p", aspect_ratio: "9:16" },
    });
    const videoConfig = (body.generation_config as { video_config: Record<string, unknown> }).video_config;
    expect(Object.keys(videoConfig)).toEqual(["task"]);
    expect(videoConfig.task).toBe("reference_to_video");
  });

  it("carries the dimensional params in response_format instead", () => {
    const body = buildOmniRequestBody({
      imageParts: [], text: "x", task: "text_to_video",
      params: { duration: 5, resolution: "1080p", aspect_ratio: "9:16" },
    });
    expect(body.response_format).toEqual({
      type: "video", resolution: "1080p", aspect_ratio: "9:16", delivery: "uri", duration: "5s",
    });
  });
});
