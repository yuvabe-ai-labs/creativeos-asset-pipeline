import { describe, it, expect } from "vitest";
import { getNodeOutput, renderShotForImage } from "./node-output";

describe("getNodeOutput", () => {
  it("returns a text node's data.text", () => {
    expect(getNodeOutput({ type: "text", data: { text: "  hello  " }, activeOutput: null })).toBe("hello");
  });

  it("renders a shot node as the shot's visual description + production medium only (D23)", () => {
    const out = getNodeOutput({
      type: "shot",
      data: {
        script: {
          title: "Reel A",
          strategic_objective: "Sell calm",
          ai_production_type: "AI macro product photography",
          voiceover: "Soothing narration",
          caption: "Shop now #ad",
          on_screen_text: { intro: "Luxury begins here" },
          visual_script: { shots: [{ description: "Turmeric root, side-lit on marble", duration: "3s" }] },
        },
      },
      activeOutput: null,
    });
    // A Shot feeds ONE reference image, so only the shot's own visual description and the
    // production medium are kept (D23). Reel-level copy (title, objective, voiceover,
    // caption, on-screen text) is dropped: it dilutes the per-shot signal, drives
    // homogeneity, and risks baked-in text in the plate.
    expect(out).toContain("Turmeric root, side-lit on marble");
    expect(out).toContain("Medium: AI macro product photography");
    expect(out).not.toContain("Reel A");
    expect(out).not.toContain("Sell calm");
    expect(out).not.toContain("Soothing narration");
    expect(out).not.toContain("Luxury begins here");
    expect(out).not.toContain("Shop now");
  });

  it("renderShotForImage returns empty string for a null/absent script", () => {
    expect(renderShotForImage(null)).toBe("");
  });

  it("returns a prompt node's active output string", () => {
    expect(getNodeOutput({ type: "prompt", data: {}, activeOutput: "a cinematic shot" })).toBe("a cinematic shot");
  });

  it("renders a script node's parsed output as labeled text", () => {
    const out = getNodeOutput({
      type: "script",
      data: {},
      activeOutput: { title: "Reel A", strategic_objective: "Sell calm", visual_script: { shots: [{ description: "Turmeric root", duration: "3s" }] } },
    });
    expect(out).toContain("Title: Reel A");
    expect(out).toContain("Objective: Sell calm");
    expect(out).toContain("1. Turmeric root (3s)");
  });

  it("returns empty string for null output", () => {
    expect(getNodeOutput({ type: "script", data: {}, activeOutput: null })).toBe("");
    expect(getNodeOutput({ type: "text", data: {}, activeOutput: null })).toBe("");
  });
});
