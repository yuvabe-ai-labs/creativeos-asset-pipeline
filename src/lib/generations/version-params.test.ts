import { describe, it, expect } from "vitest";
import {
  paramsForRestore,
  describeVersionParams,
  describeAllVersionParams,
} from "./version-params";
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

  // D197 hid Kling's multi_shot, and this row filters on `visible` — so a version that really did
  // run with multi-shot on no longer reports it in the one-line History summary. That is the
  // intended trade: the row answers "what distinguishes two versions", and a control the operator
  // can no longer see or change distinguishes nothing. Provenance is not lost — the "Sent to
  // model" panel still carries it, which the describeAllVersionParams suite below pins.
  it("drops a hidden param from the summary even when the version recorded it", () => {
    const entries = describeVersionParams(videoSpecs("kling:kling-3-0"), { multi_shot: true });
    expect(entries.find((e) => e.name === "multi_shot")).toBeUndefined();
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

// The video-gen focus view's "Sent to model" pane: unlike a History row, it must account for
// every setting the request carried.
describe("describeAllVersionParams", () => {
  it("keeps the negative prompt History drops, flagged as long-form", () => {
    const entries = describeAllVersionParams(videoSpecs("veo:veo-3.1"), {
      duration: "8",
      negative_prompt: "blurry, low quality, distorted",
    });
    const negative = entries.find((e) => e.name === "negative_prompt");
    expect(negative?.value).toBe("blurry, low quality, distorted");
    expect(negative?.longForm).toBe(true);
    expect(entries.find((e) => e.name === "duration")?.longForm).toBe(false);
  });

  it("lists every param the version recorded, in panel order", () => {
    const entries = describeAllVersionParams(videoSpecs("kling:kling-3-0"), {
      resolution: "1080p",
      duration: 7,
      audio: "native",
      multi_shot: true,
      negative_prompt: "warped label",
    });
    expect(entries.map((e) => e.name)).toEqual([
      "resolution",
      "duration",
      "negative_prompt",
      "audio",
      "multi_shot",
    ]);
  });

  // Moved here from the describeVersionParams suite when D197 hid multi_shot: this panel is now
  // the only place a toggle still renders, so it is the only place the On/Off formatting can be
  // pinned. The formatter is shared, so the coverage is not narrowed by the move.
  it("renders a toggle as On / Off rather than true / false", () => {
    const entries = describeAllVersionParams(videoSpecs("kling:kling-3-0"), { multi_shot: true });
    expect(entries.find((e) => e.name === "multi_shot")?.value).toBe("On");
  });

  it("renders a false toggle as Off", () => {
    const entries = describeAllVersionParams(videoSpecs("kling:kling-3-0"), { multi_shot: false });
    expect(entries.find((e) => e.name === "multi_shot")?.value).toBe("Off");
  });

  it("omits a param the model never had rather than showing it empty", () => {
    // Kling infers aspect ratio from its input frame — it has no aspect_ratio spec, and a row
    // reading "Aspect ratio —" would claim a value the request never carried.
    const entries = describeAllVersionParams(videoSpecs("kling:kling-3-0"), {
      resolution: "720p",
      duration: 5,
    });
    expect(entries.some((e) => e.name === "aspect_ratio")).toBe(false);
  });

  it("appends a key the model's current specs no longer declare", () => {
    // A version outlives the spec that produced it; the setting was still sent.
    const entries = describeAllVersionParams(videoSpecs("veo:veo-3.1"), {
      duration: "8",
      cfg_scale: 0.5,
    });
    expect(entries.map((e) => `${e.label}: ${e.value}`)).toEqual([
      "Duration (s): 8",
      "Cfg scale: 0.5",
    ]);
  });

  it("still excludes the pipeline's own bookkeeping keys", () => {
    // durationSeconds is the provider's response, not an input — the panel renders it against
    // the requested duration itself.
    const entries = describeAllVersionParams(videoSpecs("veo:veo-3.1"), {
      duration: "8",
      durationSeconds: 8,
    });
    expect(entries.map((e) => e.name)).toEqual(["duration"]);
  });

  it("falls back to humanized keys for a model it no longer knows", () => {
    const entries = describeAllVersionParams(videoSpecs("veo:veo-2-retired"), {
      resolution: "720p",
      negative_prompt: "a".repeat(120),
    });
    expect(entries.map((e) => e.label)).toEqual(["Resolution", "Negative prompt"]);
    expect(entries.find((e) => e.name === "negative_prompt")?.longForm).toBe(true);
  });
});
