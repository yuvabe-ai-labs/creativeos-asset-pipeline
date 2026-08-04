import { describe, it, expect } from "vitest";
import { TEMPLATES, getTemplate } from "./index";
import { POST_FORMATS } from "../formats";
import type { PostFormat, GroupLayer } from "../types";

describe("TEMPLATES registry", () => {
  it("has exactly the four V1 templates", () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(
      ["inset-card", "lower-third", "side-column", "split-half"].sort(),
    );
  });

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
