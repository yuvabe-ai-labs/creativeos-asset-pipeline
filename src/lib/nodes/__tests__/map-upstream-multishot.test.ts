import { describe, it, expect } from "vitest";
import { mapUpstreamForVideo } from "../resolve-inputs";

const shotNode = (script: unknown, multishot: boolean) => ({
  nodeId: "n1", versionId: null, type: "shot",
  data: { script, multishot } as Record<string, unknown>,
  activeOutput: null,
});

const twoBeats = {
  strategic_objective: "Sell calm",
  visual_script: {
    shots: [
      { description: "hands lift the jar", duration_seconds: 4 },
      { description: "macro on the lid", duration_seconds: 5 },
    ],
  },
};

const oneLongBeat = {
  visual_script: { shots: [{ description: "a very long take", duration_seconds: 14 }] },
};

describe("mapUpstreamForVideo — shot", () => {
  it("emits a timecode ladder for a multi-beat multishot node", () => {
    const out = mapUpstreamForVideo(shotNode(twoBeats, true));
    expect(out.text).toContain("[0-4s] hands lift the jar");
    expect(out.text).toContain("[4-9s] macro on the lid");
  });

  // A one-line ladder saying "keep these timings exactly" would forbid the cutting that
  // multishot-on-a-single-shot is asking for — and on an over-cap shot it would outrun the
  // request's clamped duration and come back truncated at full price.
  it("never emits a ladder for a single beat, even when multishot is on", () => {
    const out = mapUpstreamForVideo(shotNode(oneLongBeat, true));
    expect(out.text).not.toContain("[0-14s]");
    expect(out.text).not.toContain("keep these timings exactly");
    expect(out.text).toContain("The model may cut within this shot.");
  });

  it("asks a non-multishot shot to hold one take", () => {
    const out = mapUpstreamForVideo(shotNode(twoBeats, false));
    expect(out.text).toContain("In a single unbroken scene. No scene cuts.");
    expect(out.text).not.toContain("[0-4s]");
  });

  // An upstream that contributes nothing must not start injecting a directive.
  it("emits nothing for an empty shot rather than a bare instruction", () => {
    expect(mapUpstreamForVideo(shotNode({ visual_script: { shots: [] } }, false)).text).toBe("");
  });
});
