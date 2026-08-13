import { describe, it, expect } from "vitest";
import { paramsForRestore, describeVersionParams } from "./version-params";
import { videoGenClientModelMap, defaultsForVideoModel } from "@/lib/video-gen/client-models";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";

// YUV-295: a version records the model and the exact params it was generated with
// (node_versions.model_used / params_used), but restoring one wrote back only the output —
// and History never showed those params at all, so there was no way to tell what produced a
// given clip or image.

const videoSpecs = (id: string) => videoGenClientModelMap[id]?.params;
const imageSpecs = (id: string) => imageGenClientModelMap[id]?.params;

describe("paramsForRestore", () => {
  it("takes the version's own values for the restored model's params", () => {
    const restored = paramsForRestore(videoSpecs("veo:veo-3.1"), {
      resolution: "1080p",
      duration: "8",
      aspect_ratio: "9:16",
      negative_prompt: "blurry",
    });
    expect(restored).toMatchObject({
      resolution: "1080p",
      duration: "8",
      aspect_ratio: "9:16",
      negative_prompt: "blurry",
    });
  });

  it("fills a param the version never recorded with the model's default", () => {
    // Params are added to a model over time; a version generated before `resolution`
    // existed has no value for it, and leaving it undefined would post `undefined` on the
    // next generate.
    const restored = paramsForRestore(videoSpecs("veo:veo-3.1"), { duration: "4" });
    expect(restored?.duration).toBe("4");
    expect(restored?.resolution).toBe(defaultsForVideoModel("veo:veo-3.1").resolution);
  });

  it("drops keys that are not params of the model", () => {
    // completeGeneration stamps durationSeconds onto params_used; it is a record of what the
    // provider returned, not a setting, and it is not in any model's param specs.
    const restored = paramsForRestore(videoSpecs("kling:kling-3-0"), {
      duration: 7,
      durationSeconds: 7,
      resolution: "1080p",
    });
    expect(restored).not.toHaveProperty("durationSeconds");
    expect(restored?.duration).toBe(7);
  });

  it("drops the image pipeline's own bookkeeping keys too", () => {
    // The image-generate route writes modelId/tokensUsed/dimensions into params_used
    // alongside the real params.
    const model = "gemini:gemini-2.5-flash-image";
    const restored = paramsForRestore(imageSpecs(model), {
      modelId: model,
      tokensUsed: { input: 10, output: 20 },
      imageWidth: 1024,
      imageHeight: 1024,
      fileSizeBytes: 4096,
    });
    expect(restored).not.toHaveProperty("modelId");
    expect(restored).not.toHaveProperty("tokensUsed");
    expect(restored).not.toHaveProperty("imageWidth");
    expect(restored).not.toHaveProperty("fileSizeBytes");
  });

  it("returns null when the client no longer knows the model", () => {
    // The caller restores the output alone in this case rather than writing params that
    // belong to no model.
    expect(paramsForRestore(videoSpecs("veo:veo-2-retired"), { duration: "8" })).toBeNull();
  });
});

describe("describeVersionParams", () => {
  it("labels each param with the model's own label, in panel order", () => {
    const entries = describeVersionParams(videoSpecs("veo:veo-3.1"), {
      resolution: "1080p",
      duration: "8",
      aspect_ratio: "9:16",
    });
    expect(entries.map((e) => `${e.label}: ${e.value}`)).toEqual([
      "Resolution: 1080p",
      "Duration (s): 8",
      "Aspect Ratio: 9:16",
    ]);
  });

  it("renders a toggle as On / Off rather than true / false", () => {
    const entries = describeVersionParams(videoSpecs("kling:kling-3-0"), { multi_shot: true });
    expect(entries.find((e) => e.name === "multi_shot")?.value).toBe("On");
  });

  it("omits long-form text params — a negative prompt is a paragraph, not a chip", () => {
    const entries = describeVersionParams(videoSpecs("veo:veo-3.1"), {
      duration: "8",
      negative_prompt: "blurry, low quality, distorted",
    });
    expect(entries.some((e) => e.name === "negative_prompt")).toBe(false);
    expect(entries).toHaveLength(1);
  });

  it("skips params the version has no value for", () => {
    const entries = describeVersionParams(videoSpecs("veo:veo-3.1"), { duration: "8" });
    expect(entries.map((e) => e.name)).toEqual(["duration"]);
  });

  it("summarises an image version through its own model's specs", () => {
    const model = "gemini:gemini-2.5-flash-image";
    const specs = imageSpecs(model);
    const first = specs?.find((p) => p.visible && p.component !== "textarea");
    expect(first).toBeDefined();
    const entries = describeVersionParams(specs, {
      modelId: model,
      [first!.name]: first!.defaultValue,
      tokensUsed: { input: 1, output: 2 },
    });
    expect(entries.map((e) => e.name)).toEqual([first!.name]);
  });

  it("falls back to humanized keys for a model it no longer knows", () => {
    // Legacy versions of a pruned model still deserve to say what they ran with.
    const entries = describeVersionParams(videoSpecs("veo:veo-2-retired"), {
      resolution: "720p",
      aspect_ratio: "16:9",
      durationSeconds: 8,
      modelId: "veo:veo-2-retired",
    });
    expect(entries.map((e) => `${e.label}: ${e.value}`)).toEqual([
      "Resolution: 720p",
      "Aspect ratio: 16:9",
    ]);
  });

  it("returns nothing for an empty params record", () => {
    expect(describeVersionParams(videoSpecs("veo:veo-3.1"), {})).toEqual([]);
  });
});
