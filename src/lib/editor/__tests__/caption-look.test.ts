import { describe, expect, it } from "vitest";
import { applyCaptionLook, applyCaptionStyle, captionLook, resetCaptionLook } from "../caption-style";
import { EditDocSchema } from "../types";
import { buildAss } from "../render-ass";
import { planSequence } from "../sequence-plan";
import type { Piece } from "../types";
import { cap, emptyDoc, source } from "./fixtures";

// D505 — a caption's own style and position, kept apart from the reel's.
const doc = emptyDoc({ captions: [cap("a", "p1", 1), cap("b", "p1", 3)] });

describe("captionLook", () => {
  it("is the reel's style when the caption has no look of its own", () => {
    expect(captionLook(doc, doc.captions[0])).toBe(doc.captionStyle);
  });

  it("puts the caption's own keys over the reel's", () => {
    const d = applyCaptionLook(doc, "a", { font: "anton", size: 120 });
    const look = captionLook(d, d.captions[0]);
    expect(look.font).toBe("anton");
    expect(look.size).toBe(120);
    expect(look.color).toBe(d.captionStyle.color);
    expect(captionLook(d, d.captions[1])).toBe(d.captionStyle);
  });
});

describe("applyCaptionLook", () => {
  it("gives the caption its whole style and position as its own", () => {
    const d = applyCaptionLook(doc, "a", { font: "anton" });
    expect(d.captions[0].look).toEqual({ ...doc.captionStyle, font: "anton" });
    expect(d.captions[1]).not.toHaveProperty("look");
  });

  it("moves one caption alone", () => {
    const d = applyCaptionLook(doc, "a", { x: 0.3, y: 0.2 });
    expect(captionLook(d, d.captions[0])).toMatchObject({ x: 0.3, y: 0.2 });
    expect(captionLook(d, d.captions[1])).toMatchObject({ x: doc.captionStyle.x, y: doc.captionStyle.y });
  });

  it("returns the same doc when nothing changes", () => {
    expect(applyCaptionLook(doc, "a", { font: doc.captionStyle.font })).toBe(doc);
    const d = applyCaptionLook(doc, "a", { font: "anton" });
    expect(applyCaptionLook(d, "a", { font: "anton" })).toBe(d);
    expect(applyCaptionLook(doc, "missing", { font: "anton" })).toBe(doc);
  });

  it("clamps the size and position like the reel's style", () => {
    const d = applyCaptionLook(doc, "a", { size: 9999, x: 5 });
    expect(captionLook(d, d.captions[0])).toMatchObject({ size: 200, x: 0.96 });
  });

  it("keeps a styled caption as it is when the reel's style changes later", () => {
    const d = applyCaptionStyle(applyCaptionLook(doc, "a", { font: "anton" }), { color: "#ff0000", y: 0.2 });
    expect(captionLook(d, d.captions[0])).toMatchObject({ font: "anton", color: doc.captionStyle.color, y: doc.captionStyle.y });
    expect(captionLook(d, d.captions[1])).toMatchObject({ color: "#ff0000", y: 0.2 });
  });
});

describe("resetCaptionLook", () => {
  it("puts the caption back on the reel's look", () => {
    const d = resetCaptionLook(applyCaptionLook(doc, "a", { font: "anton" }), "a");
    expect(d.captions[0]).not.toHaveProperty("look");
    expect(resetCaptionLook(d, "a")).toBe(d);
  });
});

describe("the saved edit", () => {
  it("reads a caption's look back", () => {
    const d = applyCaptionLook(doc, "a", { font: "anton", upcoming: "hide" });
    const parsed = EditDocSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(parsed.captions[0].look).toEqual({ ...doc.captionStyle, font: "anton", upcoming: "hide" });
  });
});

describe("export", () => {
  const piece: Piece = { id: "p1", sourceNodeId: "a", in: 0, out: 121 / 24, picture: "original", sound: "original" };
  const reel = emptyDoc({
    pieces: [piece],
    captionStyle: { ...emptyDoc().captionStyle, wordByWord: false, box: false },
    captions: [cap("a", "p1", 0.5), cap("b", "p1", 2.5)],
  });

  it("gives each caption's titles its own font and size", () => {
    const d = applyCaptionLook(reel, "b", { font: "anton", size: 120 });
    const r = planSequence(d, [source("a")]);
    if (!r.ok) throw new Error(r.reason);
    const [first, second] = r.plan.titles;
    expect(first.fontKey).toBe(reel.captionStyle.font);
    expect(second.fontKey).toBe("anton");
    expect(second.sizePx).toBeGreaterThan(first.sizePx);
  });

  it("writes one ASS style per look and points each line at its own", () => {
    const d = applyCaptionLook(reel, "b", { font: "anton" });
    const r = planSequence(d, [source("a")]);
    if (!r.ok) throw new Error(r.reason);
    const ass = buildAss(r.plan, { width: 720, height: 1280 })!;
    expect(ass).toMatch(/^Style: Caption,/m);
    expect(ass).toMatch(/^Style: Caption2,Anton,/m);
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events[0]).toContain(",Caption,");
    expect(events[1]).toContain(",Caption2,");
  });
});
