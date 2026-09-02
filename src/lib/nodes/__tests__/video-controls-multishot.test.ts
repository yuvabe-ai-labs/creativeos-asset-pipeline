import { describe, it, expect } from "vitest";
import {
  renderVideoControls,
  LOOK_PRESETS,
  DEFAULT_VIDEO_CONTROLS,
  normalizeVideoControls,
} from "../video-controls";

describe("LOOK_PRESETS", () => {
  // The LOOK is reproduced verbatim at the top of every beat, so a preset has to read as one
  // self-contained paragraph — not a fragment needing a sentence built around it.
  it("each preset is a complete, self-contained look paragraph", () => {
    expect(LOOK_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of LOOK_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.prose.length).toBeGreaterThan(80);
      expect(preset.prose.trim()).toMatch(/\.$/);
    }
  });

  // Repeatable physical facts, not mood words — "warm cinematic vibe" cannot be reproduced.
  it("each preset names light and palette rather than a mood", () => {
    for (const preset of LOOK_PRESETS) {
      expect(preset.prose).toMatch(/light|sun|shade|daylight/i);
      expect(preset.prose).toMatch(/palette/i);
    }
  });

  it("no preset uses hype adjectives", () => {
    for (const preset of LOOK_PRESETS) {
      expect(preset.prose).not.toMatch(/cinematic masterpiece|ultra realistic|8K|stunning/i);
    }
  });

  it("has unique values", () => {
    expect(new Set(LOOK_PRESETS.map((p) => p.value)).size).toBe(LOOK_PRESETS.length);
  });
});

// The single-shot control block must not change shape now that VideoControls carries more.
describe("renderVideoControls is unaffected by the multishot fields", () => {
  it("ignores look entirely", () => {
    const out = renderVideoControls({
      ...DEFAULT_VIDEO_CONTROLS,
      camera: "push-in",
      look: "Warm low sun from camera-left.",
    });
    expect(out).toContain("push-in");
    expect(out).not.toContain("Warm low sun");
  });

  it("still returns empty when everything is auto", () => {
    expect(renderVideoControls(DEFAULT_VIDEO_CONTROLS)).toBe("");
  });
});

// The route rebuilt VideoControls from `camera`/`speed` alone, so `look` — the whole multishot
// authoring surface — was dropped at the request boundary. Authored in the UI, saved on the node,
// then discarded before the resolver saw it. Nothing errored; the ladder just went out with no
// LOOK line.
describe("normalizeVideoControls", () => {
  it("carries the LOOK contract through", () => {
    expect(normalizeVideoControls({ camera: "auto", speed: "auto", look: "Low sun, camera-left." }).look)
      .toBe("Low sun, camera-left.");
  });

  it("omits look when absent, so a single shot records no multishot noise", () => {
    expect("look" in normalizeVideoControls({ camera: "static", speed: "subtle" })).toBe(false);
  });

  // The per-beat camera control is gone; a node saved while it existed must not resurrect it into
  // the version's params snapshot.
  it("drops a stale beats array from an older saved node", () => {
    expect("beats" in normalizeVideoControls({ beats: [{ camera: "push-in" }] })).toBe(false);
  });

  it("defaults camera and speed on garbage input", () => {
    expect(normalizeVideoControls(null)).toEqual({ camera: "auto", speed: "auto" });
  });
});
