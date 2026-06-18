import { describe, it, expect } from "vitest";
import { renderShotForVideo } from "../render-shot-for-video";
import type { ReelScript } from "@/lib/nodes/reel-script";

const script = {
  title: "Prakriti Reel 12",
  strategic_objective: "create product desire through tactile, slow luxury visuals",
  ai_production_type: "AI photoreal",
  caption: "Shop now — link in bio",
  on_screen_text: { intro: "NEW" },
  voiceover: "No voiceover",
  music_sound: "Ambient pad, 50 words of boilerplate...",
  cta: "Shop now",
  visual_script: {
    shots: [{ description: "condensation beads slide down a chilled amber bottle", duration: "3s" }],
  },
} as unknown as ReelScript;

describe("renderShotForVideo", () => {
  it("returns '' for null", () => {
    expect(renderShotForVideo(null)).toBe("");
  });

  it("keeps the shot action and the strategic objective", () => {
    const out = renderShotForVideo(script);
    expect(out).toContain("condensation beads slide down a chilled amber bottle");
    expect(out).toContain("create product desire");
  });

  it("drops overlay copy and audio boilerplate", () => {
    const out = renderShotForVideo(script);
    expect(out).not.toContain("Shop now");      // caption / cta
    expect(out).not.toContain("NEW");           // on_screen_text
    expect(out).not.toContain("boilerplate");   // music_sound
    expect(out).not.toContain("No voiceover");  // voiceover
  });
});
