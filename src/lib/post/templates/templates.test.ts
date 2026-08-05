import { describe, it, expect } from "vitest";
import { TEMPLATES, getTemplate } from "./index";
import { POST_FORMATS } from "../formats";
import type { PostFormat, GroupLayer } from "../types";


describe("TEMPLATES registry", () => {
  it("every template has a unique id", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template declares a copy zone with a valid side and fraction in (0,1]", () => {
    for (const t of TEMPLATES) {
      expect(["top", "bottom", "left", "right"]).toContain(t.copyZone.side);
      expect(t.copyZone.fraction).toBeGreaterThan(0);
      expect(t.copyZone.fraction).toBeLessThanOrEqual(1);
    }
  });

  it("every template has at least one purpose tag", () => {
    for (const t of TEMPLATES) {
      expect(t.purposeTags.length).toBeGreaterThan(0);
    }
  });

  it("getTemplate resolves a known id and returns undefined for an unknown one", () => {
    expect(getTemplate("lower-third")?.id).toBe("lower-third");
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });

  it("every template produces in-bounds layers (0-1) for every format", () => {
    const formats = Object.keys(POST_FORMATS) as PostFormat[];
    for (const t of TEMPLATES) {
      for (const format of formats) {
        const layers = t.seedLayers(format);
        expect(layers.length).toBeGreaterThan(0);
        for (const layer of layers) {
          expect(layer.x).toBeGreaterThanOrEqual(0);
          expect(layer.y).toBeGreaterThanOrEqual(0);
          expect(layer.x + layer.w).toBeLessThanOrEqual(1.001); // float slop
          expect(layer.y + layer.h).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  it("seedLayers produces fresh layer ids on every call (no shared references across posts)", () => {
    const a = getTemplate("lower-third")!.seedLayers("ig-square");
    const b = getTemplate("lower-third")!.seedLayers("ig-square");
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("every template seeds its CTA pill as a shape+text group", () => {
    for (const t of TEMPLATES) {
      const layers = t.seedLayers("ig-square");
      const groups = layers.filter((l): l is GroupLayer => l.kind === "group");
      expect(groups.length).toBe(1);
      expect(groups[0].childIds.length).toBe(2);
    }
  });
});

const ALL_FORMATS = Object.keys(POST_FORMATS) as PostFormat[];

describe("templates are format-aware", () => {
  it("keeps every layer in bounds at every format", () => {
    for (const t of TEMPLATES) {
      for (const format of ALL_FORMATS) {
        for (const layer of t.seedLayers(format)) {
          expect(layer.x, `${t.id} @ ${format}`).toBeGreaterThanOrEqual(0);
          expect(layer.y, `${t.id} @ ${format}`).toBeGreaterThanOrEqual(0);
          expect(layer.x + layer.w, `${t.id} @ ${format}`).toBeLessThanOrEqual(1.001);
          expect(layer.y + layer.h, `${t.id} @ ${format}`).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  it("actually varies its layout between a story and a landscape post", () => {
    for (const t of TEMPLATES) {
      const portrait = JSON.stringify(t.seedLayers("ig-story").map((l) => [l.x, l.y, l.w, l.h]));
      const landscape = JSON.stringify(t.seedLayers("x-post").map((l) => [l.x, l.y, l.w, l.h]));
      expect(portrait, `${t.id} ignores its format`).not.toBe(landscape);
    }
  });

  it("seeds exactly one CTA group of two layers at every format", () => {
    for (const t of TEMPLATES) {
      for (const format of ALL_FORMATS) {
        const groups = t.seedLayers(format).filter((l) => l.kind === "group");
        expect(groups, `${t.id} @ ${format}`).toHaveLength(1);
        expect(groups[0].kind === "group" && groups[0].childIds).toHaveLength(2);
      }
    }
  });

  it("never seeds empty placeholder copy", () => {
    for (const t of TEMPLATES) {
      for (const layer of t.seedLayers("ig-square")) {
        if (layer.kind === "text") expect(layer.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the template library", () => {
  // NOTE: this worktree only has 4 original + 3 (sale-offer, event, minimal-frame) = 7
  // templates. Two sibling worktrees are adding the other 7 in parallel. Once all three
  // template branches are merged this must become toHaveLength(14).
  it("ships seven templates with unique ids", () => {
    expect(TEMPLATES).toHaveLength(7);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("gives every template a human name and at least one purpose tag", () => {
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.name).not.toBe(t.id);
      expect(t.purposeTags.length).toBeGreaterThan(0);
    }
  });
});
