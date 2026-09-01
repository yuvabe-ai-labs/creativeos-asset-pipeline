import { describe, it, expect } from "vitest";
import {
  beatControlsFor,
  renderVideoControls,
  LOOK_PRESETS,
  DEFAULT_VIDEO_CONTROLS,
  normalizeVideoControls,
} from "../video-controls";

describe("beatControlsFor", () => {
  it("pads to the beat count so every beat has a row", () => {
    expect(
      beatControlsFor({ ...DEFAULT_VIDEO_CONTROLS, beats: [{ camera: "push-in" }] }, 3),
    ).toEqual([{ camera: "push-in" }, { camera: "auto" }, { camera: "auto" }]);
  });

  // Beats can be removed on the Shot node after these were saved. A stale array would pair
  // beat 3's camera with beat 2's action, which is silent and wrong.
  it("truncates when beats were removed from the shot", () => {
    const controls = {
      ...DEFAULT_VIDEO_CONTROLS,
      beats: [{ camera: "static" }, { camera: "orbit" }, { camera: "tracking" }],
    };
    expect(beatControlsFor(controls, 2)).toEqual([{ camera: "static" }, { camera: "orbit" }]);
  });

  it("returns nothing for a node with no beats", () => {
    expect(beatControlsFor(DEFAULT_VIDEO_CONTROLS, 0)).toEqual([]);
  });

  it("defaults every row to auto when nothing was authored", () => {
    expect(beatControlsFor(DEFAULT_VIDEO_CONTROLS, 2)).toEqual([
      { camera: "auto" },
      { camera: "auto" },
    ]);
  });
});

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
  it("ignores look and beats entirely", () => {
    const withExtras = {
      ...DEFAULT_VIDEO_CONTROLS,
      camera: "push-in",
      look: "Warm low sun from camera-left.",
      beats: [{ camera: "orbit" }],
    };
    const out = renderVideoControls(withExtras);
    expect(out).toContain("push-in");
    expect(out).not.toContain("Warm low sun");
    expect(out).not.toContain("orbit");
  });

  it("still returns empty when everything is auto", () => {
    expect(renderVideoControls(DEFAULT_VIDEO_CONTROLS)).toBe("");
  });
});

// The route rebuilt VideoControls from `camera`/`speed` alone, so `look` and `beats` — the entire
// multishot authoring surface — were dropped at the request boundary. Authored in the UI, saved on
// the node, then discarded before the resolver saw them. Nothing errored; the ladder just went out
// with no LOOK line and every beat on "auto".
describe("normalizeVideoControls", () => {
  it("carries the LOOK contract through", () => {
    expect(normalizeVideoControls({ camera: "auto", speed: "auto", look: "Low sun, camera-left." }).look)
      .toBe("Low sun, camera-left.");
  });

  it("carries the per-beat cameras through", () => {
    expect(
      normalizeVideoControls({ beats: [{ camera: "push-in" }, { camera: "static" }] }).beats,
    ).toEqual([{ camera: "push-in" }, { camera: "static" }]);
  });

  it("omits both when absent, so a single shot records no multishot noise", () => {
    const c = normalizeVideoControls({ camera: "static", speed: "subtle" });
    expect("look" in c).toBe(false);
    expect("beats" in c).toBe(false);
  });

  it("falls back to auto for a malformed beat rather than dropping the row", () => {
    // Dropping it would shift every later beat's camera onto the wrong beat — silently.
    expect(normalizeVideoControls({ beats: [{ camera: 7 }, null, { camera: "orbit" }] }).beats)
      .toEqual([{ camera: "auto" }, { camera: "auto" }, { camera: "orbit" }]);
  });

  it("defaults camera and speed on garbage input", () => {
    expect(normalizeVideoControls(null)).toEqual({ camera: "auto", speed: "auto" });
  });
});
