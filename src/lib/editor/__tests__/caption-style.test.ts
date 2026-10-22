import { describe, expect, it } from "vitest";
import { applyCaptionStyle, CAPTION_PRESETS, DEFAULT_CAPTION_STYLE, dimColor, displayText, presetOf, strokePx } from "../caption-style";
import { EditDocSchema, type EditDoc } from "../types";

const doc: EditDoc = { v: 2, shape: "9:16", sources: [], pieces: [], captions: [], captionStyle: DEFAULT_CAPTION_STYLE };

describe("caption style", () => {
  it("defaults to Bold pop, centred low", () => {
    expect(presetOf(DEFAULT_CAPTION_STYLE)).toBe("bold");
    expect(DEFAULT_CAPTION_STYLE).toMatchObject({ x: 0.5, y: 0.72, font: "montserrat", size: 84, wordByWord: true });
  });

  it("a preset changes the look, never the position", () => {
    const moved = applyCaptionStyle(doc, { x: 0.3, y: 0.4 });
    const boxed = applyCaptionStyle(moved, CAPTION_PRESETS.boxed.look);
    expect(boxed.captionStyle).toMatchObject({ x: 0.3, y: 0.4, box: true, font: "poppins" });
    expect(presetOf(boxed.captionStyle)).toBe("boxed");
  });

  it("returns the same doc for a no-op and clamps position and size", () => {
    expect(applyCaptionStyle(doc, { size: DEFAULT_CAPTION_STYLE.size })).toBe(doc);
    expect(applyCaptionStyle(doc, { x: 2, y: -1 }).captionStyle).toMatchObject({ x: 0.96, y: 0.04 });
    expect(applyCaptionStyle(doc, { size: 999 }).captionStyle.size).toBe(200);
  });

  it("dims as a solid colour mixed toward the box, or black", () => {
    expect(dimColor({ ...DEFAULT_CAPTION_STYLE, color: "#ffffff", box: false })).toBe("#737373");
    expect(dimColor({ ...DEFAULT_CAPTION_STYLE, color: "#ffffff", box: true, boxColor: "#111111" })).toBe("#7c7c7c");
  });

  it("upper-cases in code, so the stage and Premiere agree", () => {
    expect(displayText("Make dosa", { ...DEFAULT_CAPTION_STYLE, upper: true })).toBe("MAKE DOSA");
    expect(displayText("Make dosa", { ...DEFAULT_CAPTION_STYLE, upper: false })).toBe("Make dosa");
  });

  it("sizes the outline from the text size, at least 4 px on a 1080 frame", () => {
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 84 }, 1080)).toBe(8);
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 30 }, 1080)).toBe(4);
    expect(strokePx({ ...DEFAULT_CAPTION_STYLE, size: 84 }, 720)).toBe(5);
  });
});

describe("reading a v1 edit", () => {
  it("lifts the first caption's look into the reel style and drops per-caption looks", () => {
    const v1 = {
      v: 1, shape: "9:16", sources: [], pieces: [{ id: "p", sourceNodeId: "s", in: 0, out: 4, picture: "original", sound: "original" }],
      captions: [{ id: "c", pieceId: "p", at: 1, duration: 1, text: "Hi", x: 0.4, y: 0.6, font: "anton", size: 90, color: "#FFD60A" }],
    };
    const parsed = EditDocSchema.parse(v1);
    expect(parsed.v).toBe(2);
    expect(parsed.captionStyle).toMatchObject({ font: "anton", size: 90, color: "#ffd60a", x: 0.4, y: 0.6 });
    expect(parsed.captions[0]).toEqual({ id: "c", pieceId: "p", at: 1, duration: 1, text: "Hi" });
  });

  it("gives a v1 edit with no captions the default style", () => {
    const parsed = EditDocSchema.parse({ v: 1, shape: "16:9", sources: [], pieces: [], captions: [] });
    expect(parsed.captionStyle).toEqual(DEFAULT_CAPTION_STYLE);
  });
});
