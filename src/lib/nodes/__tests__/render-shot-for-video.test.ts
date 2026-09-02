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

  // A Shot node made from a 3-row generation is ONE continuous take covering all three rows.
  // Reading shots[0] dropped two thirds of what the operator switched to a single take.
  it("joins every row of the generation into one action", () => {
    const text = renderShotForVideo({
      strategic_objective: "sell the shoe",
      visual_script: {
        shots: [
          { description: "close on keys" },
          { description: "a cab door swings" },
          { description: "feet hit the street" },
        ],
      },
    } as unknown as ReelScript);
    expect(text).toBe(
      "Action: close on keys A cab door swings Feet hit the street\nObjective: sell the shoe",
    );
  });

  it("skips blank rows rather than emitting double spaces", () => {
    const text = renderShotForVideo({
      visual_script: { shots: [{ description: "close on keys" }, { description: "  " }] },
    } as unknown as ReelScript);
    expect(text).toBe("Action: close on keys");
  });
});
