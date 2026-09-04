import { describe, expect, it } from "vitest";
import type { MoodboardItem } from "@/lib/db/moodboards";
import type { SignalWithItems } from "@/lib/db/signals";
import {
  buildSignalBrief,
  normalizeSignalIds,
  normalizeSignalMode,
  selectSignalsByIds,
} from "./signal-brief";

function item(note: string | null): MoodboardItem {
  return {
    id: `it-${Math.random().toString(36).slice(2, 8)}`,
    moodboard_id: "mb-1",
    image_url: "https://cdn.example.com/x.jpg",
    source_url: null,
    kind: "image",
    note,
    added_by: null,
    thumbnail_url: null,
    position: 0,
    added_at: "2026-08-30T00:00:00Z",
  };
}

function signal(overrides: Partial<SignalWithItems> = {}): SignalWithItems {
  return {
    id: "sig-1",
    client_id: "cl-1",
    name: "Rakshabandhan",
    tags: ["festival", "gifting"],
    description: "Sibling gifting moments trend every August.",
    created_by: null,
    created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z",
    items: [item("rakhi tying close-up"), item(null), item("  ")],
    ...overrides,
  };
}

describe("normalizeSignalMode", () => {
  it("accepts the two valid modes", () => {
    expect(normalizeSignalMode("tint")).toBe("tint");
    expect(normalizeSignalMode("rewrite")).toBe("rewrite");
  });
  it("falls back to tint for anything else", () => {
    expect(normalizeSignalMode("REWRITE")).toBe("tint");
    expect(normalizeSignalMode(undefined)).toBe("tint");
    expect(normalizeSignalMode(42)).toBe("tint");
  });
});

describe("normalizeSignalIds", () => {
  it("keeps string ids, deduped, in order", () => {
    expect(normalizeSignalIds(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
  it("drops non-strings and empties; non-array yields []", () => {
    expect(normalizeSignalIds(["a", 1, null, ""])).toEqual(["a"]);
    expect(normalizeSignalIds("a")).toEqual([]);
    expect(normalizeSignalIds(undefined)).toEqual([]);
  });
});

describe("selectSignalsByIds", () => {
  it("returns owned signals in the requested order, dropping unknown ids", () => {
    const a = signal({ id: "a", name: "A" });
    const b = signal({ id: "b", name: "B" });
    const picked = selectSignalsByIds([a, b], ["b", "deleted", "a"]);
    expect(picked.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("buildSignalBrief", () => {
  it("renders name, tags, description, and only non-empty notes", () => {
    expect(buildSignalBrief([signal()])).toBe(
      [
        "Market signal: Rakshabandhan  [tags: festival, gifting]",
        "Sibling gifting moments trend every August.",
        "Evidence notes:",
        "- rakhi tying close-up",
      ].join("\n"),
    );
  });
  it("omits the tags suffix, description line, and notes section when empty", () => {
    const bare = signal({ tags: [], description: "", items: [item(null)] });
    expect(buildSignalBrief([bare])).toBe("Market signal: Rakshabandhan");
  });
  it("joins multiple signals with a blank line, preserving order", () => {
    const a = signal({ id: "a", name: "A", tags: [], description: "da", items: [] });
    const b = signal({ id: "b", name: "B", tags: [], description: "db", items: [] });
    expect(buildSignalBrief([a, b])).toBe(
      "Market signal: A\nda\n\nMarket signal: B\ndb",
    );
  });
  it("returns empty string for no signals", () => {
    expect(buildSignalBrief([])).toBe("");
  });
});
