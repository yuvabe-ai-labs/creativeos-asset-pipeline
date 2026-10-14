import { describe, it, expect } from "vitest";
import { selectCardsForSummary, shareOut, spread } from "./sample";
import type { CardEntry } from "./aggregate";
import type { ImageCard } from "./card-schema";

const many = (source: CardEntry["source"], format: ImageCard["format"], n: number): CardEntry[] =>
  Array.from({ length: n }, (_, i) => ({ source, card: { format, summary: `${source}-${format}-${i}` } as ImageCard }));
const count = (out: CardEntry[], source: string) => out.filter((e) => e.source === source).length;

describe("selectCardsForSummary", () => {
  it("sends every card when they fit, uploads first", () => {
    const out = selectCardsForSummary([...many("instagram", "in_use", 3), ...many("upload", "product_shot", 2)], 10);
    expect(out).toHaveLength(5);
    expect(out.slice(0, 2).every((e) => e.source === "upload")).toBe(true);
  });

  it("above the cap, keeps the mix in proportion and still shows small groups", () => {
    const entries = [...many("instagram", "in_use", 90), ...many("website", "product_shot", 10), ...many("upload", "people", 4)];
    const out = selectCardsForSummary(entries, 24);
    expect(out).toHaveLength(24);
    expect(count(out, "upload")).toBe(4);
    // 20 places for 100 imported cards: Instagram keeps most, the website group is not dropped.
    expect(count(out, "instagram")).toBe(16);
    expect(count(out, "website")).toBe(4);
  });

  it("gives uploads at most a third of the places when other images exist", () => {
    const out = selectCardsForSummary([...many("upload", "product_shot", 500), ...many("instagram", "in_use", 500)], 300);
    expect(out).toHaveLength(300);
    expect(count(out, "upload")).toBe(100);
  });

  it("fills with uploads when there is little else", () => {
    const out = selectCardsForSummary([...many("upload", "product_shot", 500), ...many("instagram", "in_use", 20)], 300);
    expect(count(out, "upload")).toBe(280);
    expect(count(out, "instagram")).toBe(20);
  });

  it("samples a 5,000-card brand down to the cap", () => {
    const entries = [
      ...many("instagram", "in_use", 3000),
      ...many("instagram", "text_graphic", 1500),
      ...many("facebook", "people", 480),
      ...many("website", "detail", 20),
    ];
    const out = selectCardsForSummary(entries, 1000);
    expect(out).toHaveLength(1000);
    expect(new Set(out).size).toBe(1000);
    expect(count(out, "website")).toBeGreaterThanOrEqual(3);
  });
});

describe("spread", () => {
  it("picks evenly across the list, starting at the first", () => {
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
    expect(spread([1, 2], 5)).toEqual([1, 2]);
  });
});

describe("shareOut", () => {
  it("gives each group a floor, then the rest by size, summing to the budget", () => {
    expect(shareOut([90, 10], 20, 3)).toEqual([16, 4]);
    expect(shareOut([5, 1], 20, 3)).toEqual([5, 1]);
  });

  it("drops the floor when there are too many groups for it", () => {
    const q = shareOut([100, 100, 100, 100], 6, 3);
    expect(q.reduce((a, b) => a + b, 0)).toBe(6);
  });
});
