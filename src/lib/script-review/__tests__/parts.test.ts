// src/lib/script-review/__tests__/parts.test.ts
import { describe, it, expect } from "vitest";
import {
  columnsToPart, isPartInVersion, parsePart, partKey, partLabel, partOrder, partToColumns, versionParts,
} from "../parts";
import type { Part } from "../types";
import { avatarSnapshot, content, reelDoc } from "./fixtures";

describe("partLabel", () => {
  const doc = reelDoc();
  it("names each kind of part as the page shows it", () => {
    expect(partLabel({ kind: "context" }, doc)).toBe("Context");
    expect(partLabel({ kind: "shot", shotId: "s04" }, doc)).toBe("S4");
    expect(partLabel({ kind: "panel", shotId: "s04" }, doc)).toBe("S4 panel");
    expect(partLabel({ kind: "cast", castId: "meenakshi" }, doc)).toBe("Meenakshi");
    expect(partLabel({ kind: "view", castId: "meenakshi", view: "left" }, doc)).toBe("Meenakshi · Left view");
  });
  it("is null for a part the script no longer has", () => {
    expect(partLabel({ kind: "shot", shotId: "gone" }, doc)).toBeNull();
    expect(partLabel({ kind: "cast", castId: "gone" }, doc)).toBeNull();
  });
});

describe("partKey", () => {
  it("is equal for equal parts and different for a shot and its panel", () => {
    expect(partKey({ kind: "shot", shotId: "s01" })).toBe(partKey({ kind: "shot", shotId: "s01" }));
    expect(partKey({ kind: "shot", shotId: "s01" })).not.toBe(partKey({ kind: "panel", shotId: "s01" }));
  });
});

describe("partOrder", () => {
  it("orders parts as the page shows them: context, cast with views, shots with panels", () => {
    const doc = reelDoc();
    const parts: Part[] = [
      { kind: "shot", shotId: "s02" },
      { kind: "panel", shotId: "s01" },
      { kind: "view", castId: "meenakshi", view: "back" },
      { kind: "context" },
      { kind: "shot", shotId: "s01" },
      { kind: "cast", castId: "husband" },
      { kind: "cast", castId: "meenakshi" },
    ];
    const sorted = [...parts].sort((a, b) => partOrder(a, doc) - partOrder(b, doc)).map((p) => partLabel(p, doc));
    expect(sorted).toEqual(["Context", "Meenakshi", "Meenakshi · Back view", "Meenakshi's husband", "S1", "S1 panel", "S2"]);
  });
});

describe("versionParts", () => {
  it("a script-only share offers the context, every shot and every cast member, and nothing else", () => {
    // Forged visuals on a script-only share are ignored: the scope decides.
    const v = content({ visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t1", url: "u" } } } });
    const parts = versionParts(v);
    expect(parts).toHaveLength(1 + 14 + 2);
    expect(parts.some((p) => p.kind === "view" || p.kind === "panel")).toBe(false);
  });

  it("a share with avatars adds a view only where the view has an image", () => {
    const v = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f", left: "l" }) }, panels: {} } });
    const views = versionParts(v).filter((p) => p.kind === "view");
    expect(views).toEqual([
      { kind: "view", castId: "meenakshi", view: "front" },
      { kind: "view", castId: "meenakshi", view: "left" },
    ]);
  });

  it("a full share adds a panel only for shots that have one", () => {
    const v = content({ scope: "panels", visuals: { avatars: {}, panels: { s03: { takeId: "t3", url: "u3" } } } });
    expect(versionParts(v).filter((p) => p.kind === "panel")).toEqual([{ kind: "panel", shotId: "s03" }]);
  });
});

describe("isPartInVersion (Review Focus 3)", () => {
  it("refuses a shot the version lacks, a view with no image, and a panel on a partial share", () => {
    const withFront = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t", url: "u" } } } });
    expect(isPartInVersion({ kind: "shot", shotId: "s99" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "view", castId: "meenakshi", view: "left" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "panel", shotId: "s01" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "view", castId: "meenakshi", view: "front" }, withFront)).toBe(true);
    expect(isPartInVersion({ kind: "cast", castId: "husband" }, withFront)).toBe(true);
  });
});

describe("parsePart", () => {
  it("accepts each well-formed part", () => {
    expect(parsePart({ kind: "context" })).toEqual({ kind: "context" });
    expect(parsePart({ kind: "panel", shotId: "s01" })).toEqual({ kind: "panel", shotId: "s01" });
    expect(parsePart({ kind: "view", castId: "meenakshi", view: "back" })).toEqual({ kind: "view", castId: "meenakshi", view: "back" });
  });
  it("rejects anything else", () => {
    expect(parsePart(null)).toBeNull();
    expect(parsePart("context")).toBeNull();
    expect(parsePart({ kind: "pin", x: 1 })).toBeNull();
    expect(parsePart({ kind: "shot" })).toBeNull();
    expect(parsePart({ kind: "shot", shotId: "" })).toBeNull();
    expect(parsePart({ kind: "shot", shotId: "x".repeat(65) })).toBeNull();
    expect(parsePart({ kind: "view", castId: "meenakshi", view: "top" })).toBeNull();
  });
});

describe("columns", () => {
  it("round-trips every kind through the table's columns", () => {
    const parts: Part[] = [
      { kind: "context" },
      { kind: "shot", shotId: "s01" },
      { kind: "panel", shotId: "s01" },
      { kind: "cast", castId: "husband" },
      { kind: "view", castId: "meenakshi", view: "right" },
    ];
    for (const p of parts) {
      const c = partToColumns(p);
      expect(columnsToPart(c.part_kind, c.part_id, c.part_view)).toEqual(p);
    }
  });
});
