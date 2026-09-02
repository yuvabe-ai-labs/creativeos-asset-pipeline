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

  // The per-beat camera control is gone, and so is the clause it injected. Framing is the prompt
  // writer's call now — it carries the rules that decide framing across a cut, and a fixed clause
  // per beat could only fight them.
  it("emits no camera clause at all", () => {
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, camera: "push-in", speed: "dynamic" },
    });
    expect(out).not.toContain("Camera:");
    expect(out).not.toContain("constant focal length");
  });

  it("is one line per beat, with nothing between them", () => {
    const out = renderMultishotBrief({ script, controls: DEFAULT_VIDEO_CONTROLS });
    const lines = out.split("\n");
    const first = lines.findIndex((l) => l.includes("[0-4s]"));
    expect(lines[first + 1]).toContain("[4-9s]");
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

});
