import { describe, expect, it } from "vitest";
import { buildOmniBody, buildOmniPrompt, videoUriOf } from "./omni";
import { DEFAULT_OMNI_SETTINGS } from "./constants";

const body = () =>
  buildOmniBody({
    imageData: "AAAA",
    mimeType: "image/png",
    script: "  She waves.  ",
    settings: { ...DEFAULT_OMNI_SETTINGS, resolution: "720p", duration: 8, ratio: "9:16" },
  });

describe("buildOmniBody", () => {
  // Each of these was verified against the live API by the product provider; getting any of
  // them wrong is a 400 or a silently wrong render.
  it("puts the image first and the text last — @Image 1 counts this array from 1", () => {
    const input = body().input as { type: string }[];
    expect(input.map((p) => p.type)).toEqual(["image", "text"]);
  });

  it("sets store:true (required by delivery:uri) and a synchronous, non-streaming call", () => {
    const b = body();
    expect(b.store).toBe(true);
    expect(b.background).toBe(false);
    expect(b.stream).toBe(false);
  });

  it("puts task in video_config and nothing else there", () => {
    const cfg = body().generation_config as { video_config: Record<string, unknown> };
    expect(cfg.video_config).toEqual({ task: "reference_to_video" });
  });

  it("carries the dimensions in response_format, with duration as a string", () => {
    expect(body().response_format).toEqual({
      type: "video",
      resolution: "720p",
      aspect_ratio: "9:16",
      delivery: "uri",
      duration: "8s",
    });
  });
});

describe("buildOmniPrompt", () => {
  it("declares @Image 1 and trims the script", () => {
    const text = buildOmniPrompt("  She waves.  ");
    expect(text.startsWith("@Image 1 is a reference image.")).toBe(true);
    expect(text).toContain("She waves.");
    expect(text).toContain("Use the person in @Image 1");
  });
});

describe("videoUriOf", () => {
  it("reads the uri from the model_output step", () => {
    expect(
      videoUriOf({
        steps: [
          { type: "model_input", content: [{ type: "image" }] },
          { type: "model_output", content: [{ type: "video", uri: "https://x/files/a:download" }] },
        ],
      }),
    ).toBe("https://x/files/a:download");
  });

  it("returns null when there is no video content", () => {
    expect(videoUriOf({ steps: [{ type: "model_output", content: [{ type: "text" }] }] })).toBeNull();
  });
});
