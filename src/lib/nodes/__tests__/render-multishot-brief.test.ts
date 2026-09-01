import { describe, it, expect } from "vitest";
import { renderMultishotBrief } from "../render-shot-for-video";
import { DEFAULT_VIDEO_CONTROLS } from "../video-controls";

const script = {
  strategic_objective: "Brand awareness",
  visual_script: {
    shots: [
      { description: "hands lift the jar", duration_seconds: 4 },
      { description: "macro on the lid", duration_seconds: 5 },
    ],
  },
};

describe("renderMultishotBrief", () => {
  // The system prompt reproduces the LOOK character-for-character, so anything done to it here
  // would be exactly the paraphrase the guidance warns against.
  it("passes the LOOK through untouched", () => {
    const look = "Warm low sun from camera-left, long shadows, 35mm at knee height.";
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, look },
    });
    expect(out).toContain(look);
    expect(out).toContain("LOOK —");
  });

  it("omits the LOOK block entirely when none was authored", () => {
    const out = renderMultishotBrief({ script, controls: DEFAULT_VIDEO_CONTROLS });
    expect(out).not.toContain("LOOK");
  });

  it("lays the beats end to end from their own lengths", () => {
    const out = renderMultishotBrief({ script, controls: DEFAULT_VIDEO_CONTROLS });
    expect(out).toContain("[0-4s] hands lift the jar");
    expect(out).toContain("[4-9s] macro on the lid");
  });

  it("gives each beat its own camera prose", () => {
    const out = renderMultishotBrief({
      script,
      controls: {
        ...DEFAULT_VIDEO_CONTROLS,
        beats: [{ camera: "push-in" }, { camera: "static" }],
      },
    });
    expect(out).toContain("constant focal length");
    expect(out).toContain("locked-off static frame");
  });

  // "auto" is the no-constraint option — it must add no camera clause at all, or every beat
  // would carry a sentence the operator never asked for.
  it("says nothing about camera for a beat left on auto", () => {
    const out = renderMultishotBrief({
      script,
      controls: {
        ...DEFAULT_VIDEO_CONTROLS,
        beats: [{ camera: "auto" }, { camera: "auto" }],
      },
    });
    expect(out).not.toContain("Camera:");
  });

  it("pairs a camera with its own beat, not the one before it", () => {
    const out = renderMultishotBrief({
      script,
      controls: {
        ...DEFAULT_VIDEO_CONTROLS,
        beats: [{ camera: "auto" }, { camera: "orbit" }],
      },
    });
    const lines = out.split("\n");
    const secondBeat = lines.findIndex((l) => l.includes("[4-9s]"));
    expect(lines[secondBeat + 1]).toContain("orbit");
  });

  it("carries the objective, which is the motion driver", () => {
    expect(renderMultishotBrief({ script, controls: DEFAULT_VIDEO_CONTROLS }))
      .toContain("Brand awareness");
  });

  it("returns an empty string when there are no beats", () => {
    expect(renderMultishotBrief({ script: null, controls: DEFAULT_VIDEO_CONTROLS })).toBe("");
    expect(
      renderMultishotBrief({
        script: { visual_script: { shots: [] } },
        controls: DEFAULT_VIDEO_CONTROLS,
      }),
    ).toBe("");
  });

  // Beats can be added on the Shot node after the cameras were set.
  it("tolerates fewer saved cameras than beats", () => {
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, beats: [{ camera: "push-in" }] },
    });
    expect(out).toContain("[4-9s] macro on the lid");
  });
});
