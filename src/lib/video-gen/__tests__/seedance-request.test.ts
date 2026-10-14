import { describe, it, expect } from "vitest";
import { buildSeedanceBody } from "../providers/seedance";
import type { VideoGenInput } from "../types";

const input = (overrides: Partial<VideoGenInput> = {}): VideoGenInput => ({
  prompt: "a presenter talking",
  referenceUrls: [],
  params: { resolution: "480p", duration: 5, ratio: "9:16" },
  ...overrides,
});

const contentOf = (i: VideoGenInput) => buildSeedanceBody(i, 4).content as Record<string, unknown>[];
const AUDIO = { type: "audio_url", audio_url: { url: "https://storage.googleapis.com/b/voice.mp3" }, role: "reference_audio" };

describe("buildSeedanceBody — frames and references stay mutually exclusive", () => {
  it("sends a first frame and no reference images", () => {
    const content = contentOf(input({ startFrameUrl: "first.png", referenceUrls: ["ref.png"] }));
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "first.png" }, role: "first_frame" });
    expect(content.some((c) => c.role === "reference_image")).toBe(false);
  });

  it("sends reference images when there is no first frame", () => {
    const content = contentOf(input({ referenceUrls: ["ref.png"] }));
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "ref.png" }, role: "reference_image" });
  });
});

// D296 — the avatar's voice reference. Audio is a THIRD part type, so it is not part of the
// frames-XOR-references exclusion above: it travels with either.
describe("buildSeedanceBody — reference_audio", () => {
  it("sends the voice reference alongside a first frame", () => {
    const content = contentOf(input({ startFrameUrl: "first.png", referenceAudioUrl: AUDIO.audio_url.url }));
    expect(content).toContainEqual(AUDIO);
    expect(content).toContainEqual(expect.objectContaining({ role: "first_frame" }));
  });

  it("sends it alongside reference images too", () => {
    const content = contentOf(input({ referenceUrls: ["face.png"], referenceAudioUrl: AUDIO.audio_url.url }));
    expect(content).toContainEqual(AUDIO);
    expect(content).toContainEqual(expect.objectContaining({ role: "reference_image" }));
  });

  it("sends it on a text-only request", () => {
    expect(contentOf(input({ referenceAudioUrl: AUDIO.audio_url.url }))).toContainEqual(AUDIO);
  });

  it("sends no audio part when the avatar has no reference", () => {
    expect(contentOf(input()).some((c) => c.role === "reference_audio")).toBe(false);
  });

  it("leaves the prompt first — the @ImageN order the prompt refers to counts images only", () => {
    const content = contentOf(input({ referenceUrls: ["face.png"], referenceAudioUrl: AUDIO.audio_url.url }));
    expect(content[0]).toEqual({ type: "text", text: "a presenter talking" });
    expect(content.at(-1)).toEqual(AUDIO);
  });
});
