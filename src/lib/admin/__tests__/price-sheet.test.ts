import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { CATALOG_CHANGE_LEAD_MS } from "@/lib/ai-models/pricing";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import {
  cellCredits,
  diffSummary,
  lengthOptions,
  noPriceText,
  priceTimeline,
  scheduledNotice,
  sheetFootnote,
  sheetTitle,
  tryARun,
  tryRunOptions,
  type TimelineInputRow,
} from "../price-sheet";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z"); // 24 Nov 2026, 12:00 IST
const OMNI11 = "gemini:gemini-omni-1.1-flash";
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
const pricesOf = (id: string) => catalog.prices.filter((p) => p.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
const [omniNow, omniNext] = pricesOf(OMNI11);
const sunburst = pricesOf(SUNBURST)[0];
const ZERO = { marginPercent: 0, roundStep: 5 as const };

describe("sheetTitle and cellCredits", () => {
  it("names the main price by its unit", () => {
    expect(sheetTitle("video")).toBe("Per second of video");
    expect(sheetTitle("image")).toBe("Per image");
    expect(sheetTitle("text")).toBe("Prices");
  });

  it("shows credits before the run is rounded, with the live margin, to 2 decimals", () => {
    expect(cellCredits(0.0337925, ZERO)).toBe("33.79");
    expect(cellCredits(0.10136, ZERO)).toBe("101.36");
    expect(cellCredits(0.0132, ZERO)).toBe("13.2");
    expect(cellCredits(0.10136, { marginPercent: 20 })).toBe("121.63");
    expect(cellCredits(1.5, ZERO)).toBe("1,500");
  });
});

describe("sheetFootnote", () => {
  it("explains credits per second and token prices for a video model", () => {
    expect(sheetFootnote(model(OMNI11), omniNow, ZERO)).toBe(
      "Credits are shown per second before a run is rounded up to the next 5 credits. Token prices are per 1M tokens.",
    );
  });

  it("names the margin when there is one, and the typical image run's extras", () => {
    expect(sheetFootnote(model(SUNBURST), sunburst, { marginPercent: 20, roundStep: 1 })).toBe(
      "Credits are shown per image, with the 20% margin, before a run is rounded up to the next credit. Token prices are per 1M tokens. A typical run adds the prompt and one reference image.",
    );
  });

  it("is null when nothing applies", () => {
    expect(sheetFootnote(model(OMNI11), null, ZERO)).toBeNull();
    const dub = pricesOf("sarvam:dub")[0];
    expect(sheetFootnote(model("sarvam:dub"), dub, ZERO)).toBeNull();
  });
});

describe("noPriceText", () => {
  it("names the settings the admin will price", () => {
    expect(noPriceText(model("kling:kling-3-0"))).toBe(
      "Runs can't be charged without one, so Kling 3.0 stays a draft. You'll enter a price for each of its settings: 720p, 1080p, 4K, each with audio and no audio.",
    );
    expect(noPriceText(model("openai:gpt-image-2"))).toContain("each at Low, Medium or High quality.");
    expect(noPriceText(model("sarvam:dub"))).toBe("Runs can't be charged without one, so Dub stays a draft.".replace("Dub", model("sarvam:dub").label));
  });
});

describe("diffSummary", () => {
  it("says how a row moved prices from the one before", () => {
    expect(diffSummary(null, omniNow)).toBe("Starting price");
    expect(diffSummary(omniNow, omniNext)).toBe("5 prices −31%");
    const all = { ...omniNow, lines: omniNow.lines.map((l) => ({ ...l, unit_usd: l.unit_usd * 2 })) };
    expect(diffSummary(omniNow, all)).toBe(`All ${omniNow.lines.length} prices +100%`);
    const mixed = { ...omniNow, lines: omniNow.lines.map((l, i) => ({ ...l, unit_usd: l.unit_usd * (i === 0 ? 0.5 : i === 1 ? 1.1 : 1) })) };
    expect(diffSummary(omniNow, mixed)).toBe("2 prices −50% to +10%");
    const added = { ...omniNow, lines: [...omniNow.lines.slice(1), { meter: "request" as const, unit_usd: 1 }] };
    expect(diffSummary(omniNow, added)).toBe("Adds the price per request · Removes 1 price");
    expect(diffSummary(omniNow, omniNow)).toBe("No price changes");
  });
});

describe("scheduledNotice", () => {
  it("leads with the change and says when, in IST with UTC", () => {
    expect(scheduledNotice(omniNow, omniNext, NOW)).toEqual({
      headline: "Prices drop 31%",
      when: "from 3 Dec 2026, 13:30 IST, in 9 days.",
      utc: "08:00 UTC",
      note: "Seeded from the code price tables (D534).",
    });
  });

  it("calls a first price a starting price", () => {
    expect(scheduledNotice(null, omniNext, NOW).headline).toBe("Starting price");
  });
});

const row = (p: AiModelPrice, extra: Partial<TimelineInputRow> = {}): TimelineInputRow => ({
  id: p.id,
  effectiveFrom: p.effectiveFrom,
  createdAt: "2026-11-20T06:00:00Z",
  createdBy: "u-arun",
  createdByName: "Arun",
  price: p,
  problems: [],
  ...extra,
});

describe("priceTimeline", () => {
  it("lists the newest first: the next change, then the live price", () => {
    const t = priceTimeline([row(omniNow), row(omniNext)], { now: NOW, provider: "Google", callerId: "u-arun" });
    expect(t.items.map((i) => i.state)).toEqual(["next", "now"]);
    expect(t.items[0]).toMatchObject({
      when: "From 3 Dec 2026, 13:30 IST",
      utc: "08:00 UTC",
      badge: "Next, in 9 days",
      summary: "5 prices −31%.",
      who: "Added by Arun on 20 Nov 2026",
      canCancel: true,
      canUndo: false,
    });
    expect(t.items[1]).toMatchObject({ when: "Since 1 Jan 2026", utc: null, badge: "Live now", summary: "Starting price.", canCancel: false });
    expect(t.source).toEqual({ href: "https://aistudio.google.com/docs/pricing", text: "Google's pricing page" });
  });

  it("can't cancel a change inside the 2-minute lead", () => {
    const soon = { ...omniNext, effectiveFrom: new Date(NOW.getTime() + CATALOG_CHANGE_LEAD_MS - 1000).toISOString() };
    const t = priceTimeline([row(omniNow), row(soon)], { now: NOW, provider: "Google", callerId: "u-arun" });
    expect(t.items[0].canCancel).toBe(false);
  });

  it("offers Undo on the latest started change this admin made in the last day, when nothing is scheduled", () => {
    const fresh = { ...omniNext, id: "fresh", effectiveFrom: "2026-11-24T06:00:00Z" };
    const rows = [row(omniNow), row(fresh, { createdAt: "2026-11-24T05:59:00Z" })];
    const mine = priceTimeline(rows, { now: NOW, provider: "Google", callerId: "u-arun" });
    expect(mine.items[0]).toMatchObject({ state: "now", canUndo: true });
    expect(mine.items[1]).toMatchObject({ state: "past", badge: "Past", canUndo: false });
    expect(priceTimeline(rows, { now: NOW, provider: "Google", callerId: "u-other" }).items[0].canUndo).toBe(false);
    const withNext = [...rows, row({ ...omniNext, effectiveFrom: "2026-12-10T00:00:00Z" })];
    expect(priceTimeline(withNext, { now: NOW, provider: "Google", callerId: "u-arun" }).items.find((i) => i.id === "fresh")?.canUndo).toBe(false);
  });

  it("keeps a row that fails its check, with its problems, and the live price is the latest good one", () => {
    const broken = row(omniNow, { id: "bad", effectiveFrom: "2026-11-01T00:00:00Z", price: null, problems: ["lines: Expected array"] });
    const t = priceTimeline([row(omniNow), broken], { now: NOW, provider: "Google", callerId: "u-arun" });
    expect(t.items[0]).toMatchObject({ id: "bad", broken: true, badge: "Fails its check", problems: ["lines: Expected array"], summary: null });
    expect(t.items[1]).toMatchObject({ state: "now", badge: "Live now" });
    const future = { ...broken, effectiveFrom: "2026-12-20T00:00:00Z" };
    expect(priceTimeline([row(omniNow), future], { now: NOW, provider: "Google", callerId: "u-arun" }).items[0]).toMatchObject({ broken: true, canCancel: true });
  });

  it("is empty with no rows", () => {
    expect(priceTimeline([], { now: NOW, provider: "Google", callerId: "u" })).toEqual({ items: [], source: null });
  });
});

describe("lengthOptions and tryRunOptions", () => {
  it("offers lengths from the model's duration setting", () => {
    expect(lengthOptions(model(OMNI11))).toEqual([3, 5, 8, 10]);
    expect(lengthOptions(model("kling:kling-3-0"))).toEqual([3, 5, 8, 10, 15]);
    expect(lengthOptions(model("kling:kling-o1"))).toEqual([5, 10]);
  });

  it("gives video length and resolution, image size, quality and references", () => {
    expect(tryRunOptions(model(OMNI11), omniNow).map((g) => [g.field, g.label, g.options.map((o) => o.label)])).toEqual([
      ["seconds", "Length", ["3 s", "5 s", "8 s", "10 s"]],
      ["row", "Resolution", ["360p", "720p", "1080p", "4K"]],
    ]);
    expect(tryRunOptions(model(SUNBURST), sunburst).map((g) => [g.field, g.label, g.options.map((o) => o.label)])).toEqual([
      ["row", "Size", ["Square", "Landscape", "Portrait"]],
      ["col", "Quality", ["Low", "Medium", "High", "Extra high", "Max"]],
      ["references", "References", ["0", "1", "3"]],
    ]);
    expect(tryRunOptions(model("sarvam:dub"), pricesOf("sarvam:dub")[0])).toEqual([]);
  });
});

describe("tryARun", () => {
  it("works out the typical run with the estimator a real run uses (thinking tokens included)", () => {
    expect(tryARun(model(OMNI11), omniNow, null, {}, ZERO)).toMatchObject({
      label: "8 s, 720p",
      credits: 825,
      text: "We pay $0.82438, rounded up to the next 5 credits",
      before: null,
    });
  });

  it("follows the chosen settings, and names the margin", () => {
    const r = tryARun(model(OMNI11), omniNow, null, { seconds: 3, row: "4k" }, { marginPercent: 20, roundStep: 1 });
    expect(r?.label).toBe("3 s, 4K");
    expect(r?.text).toBe("We pay $0.92574, plus 20% margin, rounded up to the next credit");
  });

  it("compares a scheduled price with the live one", () => {
    const r = tryARun(model(OMNI11), omniNext, omniNow, {}, ZERO);
    expect(r).toMatchObject({ credits: 570, before: { credits: 825 }, text: "We pay $0.569532 instead of $0.82438", percent: { text: "−31%" } });
  });

  it("says when a setting has no price", () => {
    const partial = { ...omniNow, lines: omniNow.lines.filter((l) => l.when?.resolution !== "720p") };
    expect(tryARun(model(OMNI11), partial, null, {}, ZERO)).toMatchObject({ credits: null, text: "No price for this setting" });
  });
});
