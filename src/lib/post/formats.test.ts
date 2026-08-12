import { describe, it, expect } from "vitest";
import {
  POST_FORMATS, getFormatSpec, resolveFormat, FORMATS_BY_PLATFORM,
} from "./formats";
import type { PostFormat } from "./types";

describe("POST_FORMATS", () => {
  it("has ten formats", () => {
    expect(Object.keys(POST_FORMATS)).toHaveLength(10);
  });

  it("includes Instagram 4:5 portrait at 1080x1350", () => {
    const spec = POST_FORMATS["ig-portrait"];
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1350);
  });

  it("gives every format a human label that never contains its key", () => {
    for (const [key, spec] of Object.entries(POST_FORMATS)) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.label).not.toContain(key);
      expect(spec.shortLabel.length).toBeGreaterThan(0);
      expect(spec.shortLabel).not.toContain(key);
    }
  });

  it("only sets dpi on the print format", () => {
    for (const [key, spec] of Object.entries(POST_FORMATS)) {
      if (key === "a4-print") expect(spec.dpi).toBe(300);
      else expect(spec.dpi).toBeUndefined();
    }
  });
});

describe("resolveFormat", () => {
  it("passes through a known key", () => {
    expect(resolveFormat("ig-story")).toBe("ig-story");
  });

  it("maps the legacy 'linkedin' key to linkedin-post", () => {
    expect(resolveFormat("linkedin")).toBe("linkedin-post");
  });

  it("falls back to ig-square for unknown or missing keys", () => {
    expect(resolveFormat("nonsense")).toBe("ig-square");
    expect(resolveFormat(undefined)).toBe("ig-square");
  });
});

describe("FORMATS_BY_PLATFORM", () => {
  it("lists every format exactly once across all groups", () => {
    const flat = FORMATS_BY_PLATFORM.flatMap((g) => g.formats);
    expect(flat.slice().sort()).toEqual((Object.keys(POST_FORMATS) as PostFormat[]).sort());
  });

  it("puts Instagram first, portrait before square", () => {
    expect(FORMATS_BY_PLATFORM[0].platform).toBe("Instagram");
    expect(FORMATS_BY_PLATFORM[0].formats[0]).toBe("ig-portrait");
    expect(FORMATS_BY_PLATFORM[0].formats[1]).toBe("ig-square");
  });
});

describe("getFormatSpec", () => {
  it("returns the spec for a key", () => {
    expect(getFormatSpec("a4-print").dpi).toBe(300);
  });
});
