import { describe, it, expect } from "vitest";
import { mediaSizeToSave, nodeMediaBox, parseAspectRatio, ratioOf, resolveMediaRatio } from "./media-fit";

describe("parseAspectRatio", () => {
  it("reads w:h strings", () => {
    expect(parseAspectRatio("9:16")).toBeCloseTo(0.5625);
    expect(parseAspectRatio("16:9")).toBeCloseTo(1.7778, 3);
    expect(parseAspectRatio(" 4 : 5 ")).toBeCloseTo(0.8);
  });
  it("rejects anything else", () => {
    expect(parseAspectRatio("auto")).toBeNull();
    expect(parseAspectRatio("0:9")).toBeNull();
    expect(parseAspectRatio(undefined)).toBeNull();
    expect(parseAspectRatio(1.5)).toBeNull();
  });
});

describe("ratioOf", () => {
  it("needs two positive numbers", () => {
    expect(ratioOf(1920, 1080)).toBeCloseTo(1.7778, 3);
    expect(ratioOf(0, 1080)).toBeNull();
    expect(ratioOf(undefined, 1080)).toBeNull();
  });
});

describe("nodeMediaBox, output tier", () => {
  it("keeps landscape at full width", () => {
    expect(nodeMediaBox(16 / 9, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 255, letterboxed: false });
    expect(nodeMediaBox(21 / 9, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 195, letterboxed: false });
  });
  it("narrows portrait cards instead of growing them", () => {
    expect(nodeMediaBox(9 / 16, "output")).toEqual({ cardWidth: 307, mediaWidth: 281, mediaHeight: 500, letterboxed: false });
    expect(nodeMediaBox(4 / 5, "output")).toEqual({ cardWidth: 426, mediaWidth: 400, mediaHeight: 500, letterboxed: false });
    expect(nodeMediaBox(1, "output")).toEqual({ cardWidth: 480, mediaWidth: 454, mediaHeight: 454, letterboxed: false });
  });
  it("letterboxes only extremely tall media", () => {
    expect(nodeMediaBox(1 / 4, "output")).toEqual({ cardWidth: 280, mediaWidth: 254, mediaHeight: 600, letterboxed: true });
  });
});

describe("nodeMediaBox, input tier", () => {
  it("uses the smaller scale, edge to edge", () => {
    expect(nodeMediaBox(9 / 16, "input")).toEqual({ cardWidth: 176, mediaWidth: 174, mediaHeight: 309, letterboxed: false });
    expect(nodeMediaBox(16 / 9, "input")).toEqual({ cardWidth: 280, mediaWidth: 278, mediaHeight: 156, letterboxed: false });
  });
});

describe("resolveMediaRatio", () => {
  it("prefers measured, then saved, then the fallback, then 16:9", () => {
    expect(resolveMediaRatio({ width: 9, height: 16 }, { width: 16, height: 9 }, 1)).toBeCloseTo(0.5625);
    expect(resolveMediaRatio(null, { width: 16, height: 9 }, 1)).toBeCloseTo(1.7778, 3);
    expect(resolveMediaRatio(null, {}, 1)).toBe(1);
    expect(resolveMediaRatio(null, {}, null)).toBeCloseTo(1.7778, 3);
  });
});

describe("mediaSizeToSave", () => {
  it("writes only when the size changed and the canvas is editable", () => {
    expect(mediaSizeToSave({}, { width: 1080, height: 1920 }, true)).toEqual({ mediaWidth: 1080, mediaHeight: 1920 });
    expect(mediaSizeToSave({ width: 1080, height: 1920 }, { width: 1080, height: 1920 }, true)).toBeNull();
    expect(mediaSizeToSave({}, { width: 1080, height: 1920 }, false)).toBeNull();
    expect(mediaSizeToSave({}, { width: 0, height: 0 }, true)).toBeNull();
  });
});
