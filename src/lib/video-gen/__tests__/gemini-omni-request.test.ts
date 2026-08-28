import { describe, it, expect } from "vitest";
import {
  omniDurationSeconds,
  buildOmniResponseFormat,
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
