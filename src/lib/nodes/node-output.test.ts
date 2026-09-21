import { describe, it, expect, afterEach } from "vitest";
import { getNodeOutput, renderShotForImage, renderShotContext, shotContextMode } from "./node-output";

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

  it("returns a draw node's trimmed instructions text", () => {
    expect(
      getNodeOutput({
        type: "draw",
        data: { instructions: "  wide low-angle hero shot  " },
        activeOutput: null,
      }),
    ).toBe("wide low-angle hero shot");
  });

  it("returns empty string for a draw node with no instructions", () => {
    expect(getNodeOutput({ type: "draw", data: {}, activeOutput: null })).toBe("");
  });

  // A Multishot node has no version system, so activeOutput is always null and the `default`
  // branch returned "" — every surface that asks a node what it holds showed "No content yet."
  // beside a node full of shots. Its content is the cut ladder on node.data.
  it("renders a multishot node's cut ladder, which lives on data rather than activeOutput", () => {
    const out = getNodeOutput({
      type: "multishot",
      data: {
        cuts: [
          { id: "c1", text: "  close on keys  ", seconds: 2 },
          { id: "c2", text: "cab door", seconds: 3 },
        ],
      },
      activeOutput: null,
    });
    expect(out).toBe("Shot 1 (2s): close on keys\nShot 2 (3s): cab door");
  });

  it("names an empty cut rather than emitting a blank line for it", () => {
    const out = getNodeOutput({
      type: "multishot",
      data: { cuts: [{ id: "c1", text: "   ", seconds: 4 }] },
      activeOutput: null,
    });
    expect(out).toBe("Shot 1 (4s): (no description yet)");
  });

  it("returns empty string for a multishot node with no cuts", () => {
    expect(getNodeOutput({ type: "multishot", data: {}, activeOutput: null })).toBe("");
  });

  it("returns a post node's rendered fileUrl", () => {
    const output = getNodeOutput({
      type: "post",
      data: { fileUrl: "https://storage.googleapis.com/bucket/post.png" },
      activeOutput: null,
    });
    expect(output).toBe("https://storage.googleapis.com/bucket/post.png");
  });

  it("returns empty string for a post node with nothing rendered yet", () => {
    expect(getNodeOutput({ type: "post", data: {}, activeOutput: null })).toBe("");
  });
});

describe("renderShotContext", () => {
  const script = {
    title: "Reel A",
    strategic_objective: "Sell calm",
    ai_production_type: "AI macro product photography",
    voiceover: "Soothing narration",
    visual_script: { shots: [{ description: "Turmeric root, side-lit on marble", duration: "3s" }] },
  };

  it("minimal mode keeps only the shot description + production medium (D23)", () => {
    const out = renderShotContext(script, "minimal");
    expect(out).toContain("Turmeric root, side-lit on marble");
    expect(out).toContain("Medium: AI macro product photography");
    expect(out).not.toContain("Sell calm");
    expect(out).not.toContain("Soothing narration");
  });

  it("full mode renders the whole reel brief (pre-D23 behavior, for A/B)", () => {
    const out = renderShotContext(script, "full");
    expect(out).toContain("Title: Reel A");
    expect(out).toContain("Objective: Sell calm");
    expect(out).toContain("Voiceover: Soothing narration");
    expect(out).toContain("1. Turmeric root, side-lit on marble (3s)");
  });
});

describe("shotContextMode", () => {
  const original = process.env.SHOT_CONTEXT_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.SHOT_CONTEXT_MODE;
    else process.env.SHOT_CONTEXT_MODE = original;
  });

  it("defaults to minimal when the env var is unset (D23 default)", () => {
    delete process.env.SHOT_CONTEXT_MODE;
    expect(shotContextMode()).toBe("minimal");
  });

  it("returns full only when explicitly set to 'full'", () => {
    process.env.SHOT_CONTEXT_MODE = "full";
    expect(shotContextMode()).toBe("full");
    process.env.SHOT_CONTEXT_MODE = "something-else";
    expect(shotContextMode()).toBe("minimal");
  });
});
