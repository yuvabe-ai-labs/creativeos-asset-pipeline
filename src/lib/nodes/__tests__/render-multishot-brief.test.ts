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

// D204 — the VOICE contract, the LOOK's counterpart in sound. The CHUPPS reference is explicit:
// "LOOK and VOICE are byte-identical in all four. Do not paraphrase them between generations —
// they are the only thing making four separate renders cut together, in picture AND in sound."
describe("renderMultishotBrief — VOICE contract", () => {
  const script = {
    strategic_objective: "Brand awareness",
    visual_script: {
      shots: [
        { description: "hands lift the jar", duration_seconds: 4 },
        { description: "macro on the lid", duration_seconds: 5 },
      ],
    },
  };
  const voice = "Off-screen narration, male, early thirties. No music bed.";

  it("passes the VOICE through untouched", () => {
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, voice },
    });
    expect(out).toContain(`VOICE — ${voice}`);
  });

  it("omits the VOICE block entirely when none was authored", () => {
    expect(renderMultishotBrief({ script, controls: DEFAULT_VIDEO_CONTROLS }))
      .not.toContain("VOICE");
  });

  it("puts both contracts above the ladder, LOOK first", () => {
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, look: "Low sun, camera-left.", voice },
    });
    expect(out.indexOf("LOOK —")).toBeLessThan(out.indexOf("VOICE —"));
    expect(out.indexOf("VOICE —")).toBeLessThan(out.indexOf("[0-4s]"));
  });

  it("carries a VOICE with no LOOK", () => {
    const out = renderMultishotBrief({
      script,
      controls: { ...DEFAULT_VIDEO_CONTROLS, voice },
    });
    expect(out).toContain("VOICE —");
    expect(out).not.toContain("LOOK —");
  });
});
