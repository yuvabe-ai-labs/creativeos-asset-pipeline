import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { creditsFromUsd } from "@/lib/credits/units";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { runCostUsd, runSpec } from "../typical-runs";
import {
  buildModelsList,
  filterModelRows,
  groupModelRows,
  groupOfKind,
  priceDiff,
  type ModelsListInput,
} from "../models-list";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z"); // 24 Nov 2026, 12:00 IST
const OMNI11 = "gemini:gemini-omni-1.1-flash";
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
// The seed already schedules Omni 1.1's 3 Dec drop; tests that schedule their own start from the rows live now.
const pastPrices = catalog.prices.filter((p) => new Date(p.effectiveFrom) <= NOW);
const latest = (id: string): AiModelPrice => {
  const p = pastPrices.filter((x) => x.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
  if (!p) throw new Error(`no seeded price for ${id}`);
  return p;
};
const settings = (marginPercent: number, roundStep: 1 | 5 | 10, effectiveFrom = "2026-01-01T00:00:00Z"): CreditSettings => ({
  id: `cs@${effectiveFrom}`, effectiveFrom, marginPercent, roundStep, note: null,
});

function input(patch: Partial<ModelsListInput> = {}): ModelsListInput {
  return {
    models: catalog.models.map((m) => ({ model: m, raw: { id: m.id }, problems: [] })),
    prices: pastPrices,
    stats: [],
    creditSettings: [settings(0, 5)],
    now: NOW,
    ...patch,
  };
}

/** A copy of the model's live price, every line scaled, starting at `from`. */
function scaled(id: string, factor: number, from: string): AiModelPrice {
  const p = latest(id);
  return { ...p, id: `${id}@${from}`, effectiveFrom: from, lines: p.lines.map((l) => ({ ...l, unit_usd: l.unit_usd * factor })) };
}

describe("groupOfKind", () => {
  it("puts each kind in the prototype's groups", () => {
    expect(groupOfKind("video")).toBe("Video");
    expect(groupOfKind("image")).toBe("Image");
    expect(groupOfKind("text")).toBe("Text");
    for (const k of ["dub", "voice", "lipsync", "transcribe"]) expect(groupOfKind(k)).toBe("Audio & lip sync");
    expect(groupOfKind("scrape")).toBe("Other");
    expect(groupOfKind("something-new")).toBe("Other");
  });
});

describe("priceDiff", () => {
  it("finds changed, added and removed lines by their settings", () => {
    const old: AiModelPrice = { ...latest(OMNI11), lines: [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "720p" } }, { meter: "request", unit_usd: 1 }] };
    const next: AiModelPrice = { ...old, lines: [{ meter: "video_second", unit_usd: 0.069, when: { resolution: "720p" } }, { meter: "input_image", unit_usd: 0.01 }] };
    const d = priceDiff(old, next);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].percent).toBeCloseTo(-31);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
  });
});

describe("buildModelsList", () => {
  it("makes one row per model with its price range, typical run and no next change", () => {
    const { rows } = buildModelsList(input());
    expect(rows).toHaveLength(catalog.models.length);
    const omni = rows.find((r) => r.id === OMNI11)!;
    expect(omni.label).toBe(model(OMNI11).label);
    expect(omni.provider).toBe(model(OMNI11).providerLabel);
    expect(omni.group).toBe("Video");
    expect(omni.price?.from).toMatch(/^\$[\d.]+ a second$/);
    expect(omni.next).toBeNull();
    expect(omni.month).toBeNull();
  });

  it("works out typical-run credits with the settings row live now, not a seeded one", () => {
    const m = model(OMNI11);
    const p = latest(OMNI11);
    const usd = runCostUsd(m, p, runSpec(m, p)!)!;
    const later = settings(100, 10, "2026-12-03T00:00:00Z");
    const live = settings(20, 1, "2026-11-01T00:00:00Z");
    const { rows } = buildModelsList(input({ creditSettings: [settings(0, 5), live, later] }));
    const omni = rows.find((r) => r.id === OMNI11)!;
    expect(omni.typical?.credits).toBe(creditsFromUsd(usd, live));
    expect(omni.typical?.label).toMatch(/^\d+ s, 720p/);
  });

  it("gives every seeded model with a price a typical run or an at-cost note", () => {
    const { rows } = buildModelsList(input());
    for (const r of rows.filter((x) => x.price)) {
      expect(r.typical !== null || r.atCost, r.id).toBe(true);
    }
    const scrape = rows.find((r) => r.group === "Other");
    if (scrape) expect(scrape.atCost).toBe(true);
  });

  it("shows this month's runs and cost when the model ran", () => {
    const { rows } = buildModelsList(input({ stats: [{ modelId: OMNI11, runs: 174, costUsd: 101.08, unpriced: 2 }] }));
    expect(rows.find((r) => r.id === OMNI11)!.month).toEqual({ runs: 174, cost: "$101.08", unpriced: 2 });
  });

  it("chips the seeded 3 Dec drop and lists it under Needs a look", () => {
    const { rows, attention } = buildModelsList(input({ prices: catalog.prices }));
    const omni = rows.find((r) => r.id === OMNI11)!;
    expect(omni.next).toEqual({ chip: "−31%", tone: "down", date: "3 Dec" });
    const item = attention.find((a) => a.modelId === OMNI11)!;
    expect(item.tone).toBe("next");
    expect(item.name).toBe(model(OMNI11).label);
    expect(item.text).toBe("prices drop 31% on 3 Dec");
    expect(item.detail).toBe("Starts 3 Dec 2026, 13:30 IST, in 9 days.");
    expect(item.action).toBe("Review");
    expect(item.href).toBe(`/admin/models/${encodeURIComponent(OMNI11)}`);
  });

  it("marks a rise of 50% or more as big", () => {
    const future = scaled(OMNI11, 2, "2027-01-01T00:00:00Z");
    const { rows, attention } = buildModelsList(input({ prices: [...pastPrices, future] }));
    expect(rows.find((r) => r.id === OMNI11)!.next).toEqual({ chip: "+100%", tone: "big", date: "1 Jan" });
    expect(attention.find((a) => a.modelId === OMNI11)!.text).toBe("prices rise 100% on 1 Jan");
  });

  it("says Change when prices move by different amounts", () => {
    const p = latest(OMNI11);
    const future: AiModelPrice = {
      ...p, id: "f", effectiveFrom: "2026-12-03T08:00:00Z",
      lines: p.lines.map((l, i) => ({ ...l, unit_usd: l.unit_usd * (i === 0 ? 0.5 : 1.1) })),
    };
    const { rows, attention } = buildModelsList(input({ prices: [...pastPrices, future] }));
    expect(rows.find((r) => r.id === OMNI11)!.next?.chip).toBe("Change");
    expect(attention.find((a) => a.modelId === OMNI11)!.text).toMatch(/^\d+ prices −50% to \+10% on 3 Dec$/);
  });

  it("puts a model with no price first under Needs a look, with Add prices", () => {
    const id = OMNI11;
    const { rows, attention } = buildModelsList(input({
      models: catalog.models.map((m) => ({ model: m.id === id ? { ...m, status: "draft" as const } : m, raw: { id: m.id }, problems: [] })),
      prices: pastPrices.filter((p) => p.modelId !== id),
    }));
    const row = rows.find((r) => r.id === id)!;
    expect(row.price).toBeNull();
    expect(row.typical).toBeNull();
    const item = attention.find((a) => a.modelId === id)!;
    expect(item).toMatchObject({ tone: "bad", text: "has no price yet", action: "Add prices" });
    expect(item.detail).toBe("Runs can't be charged, so it stays a draft until it has one.");
  });

  it("flags a retired model with no replacement and a draft with a price", () => {
    const [a, b] = catalog.models;
    const { attention } = buildModelsList(input({
      models: catalog.models.map((m) => ({
        model: m.id === a.id ? { ...m, status: "retired" as const, replacedBy: null } : m.id === b.id ? { ...m, status: "draft" as const } : m,
        raw: { id: m.id }, problems: [],
      })),
    }));
    expect(attention.find((x) => x.modelId === a.id)).toMatchObject({ tone: "bad", text: "is retired with no replacement", action: "Pick one" });
    expect(attention.find((x) => x.modelId === b.id)).toMatchObject({ tone: "info", text: "is a draft", action: "Open" });
  });

  it("keeps a row that fails its check, named from the raw row, and flags it", () => {
    const { rows, attention } = buildModelsList(input({
      models: [{ model: null, raw: { id: "x:broken", label: "Broken one", kind: "video", status: "live", provider_label: "Acme" }, problems: ["params: bad"] }],
    }));
    expect(rows[0]).toMatchObject({ id: "x:broken", label: "Broken one", provider: "Acme", group: "Video", broken: true, price: null });
    expect(attention[0]).toMatchObject({ modelId: "x:broken", tone: "bad", text: "fails its check", action: "Open" });
  });

  it("adds a scheduled credit settings change first, with today's settings beside it", () => {
    const { attention, settingsLine } = buildModelsList(input({
      creditSettings: [settings(0, 5), settings(20, 10, "2026-12-02T18:30:00Z")],
    }));
    expect(settingsLine).toBe("1 credit = $0.001, margin 0%, rounds up to the next 5 credits");
    expect(attention[0]).toEqual({
      key: "credit-settings",
      modelId: null,
      tone: "next",
      name: null,
      text: "Credit settings change on 3 Dec",
      detail: "Margin 20%, rounds up to the next 10 credits, from 3 Dec 2026, 00:00 IST. Today: margin 0%, rounds up to the next 5 credits.",
      action: "Review",
      href: "/admin/credits",
    });
  });

  it("words a step of 1 as the next credit", () => {
    expect(buildModelsList(input({ creditSettings: [settings(10, 1)] })).settingsLine).toBe("1 credit = $0.001, margin 10%, rounds up to the next credit");
  });
});

describe("filterModelRows and groupModelRows", () => {
  const { rows } = buildModelsList(input({ stats: [{ modelId: OMNI11, runs: 3, costUsd: 1, unpriced: 0 }] }));

  it("filters by group, runs this month and search over name and maker", () => {
    expect(filterModelRows(rows, { group: "Video", onlyRuns: false, query: "" }).every((r) => r.group === "Video")).toBe(true);
    expect(filterModelRows(rows, { group: "all", onlyRuns: true, query: "" }).map((r) => r.id)).toEqual([OMNI11]);
    const q = model(OMNI11).providerLabel.toUpperCase();
    expect(filterModelRows(rows, { group: "all", onlyRuns: false, query: ` ${q} ` }).length).toBeGreaterThan(0);
    expect(filterModelRows(rows, { group: "all", onlyRuns: false, query: "zzzz" })).toEqual([]);
  });

  it("groups in the prototype's order, counts live models and hides retired ones until asked", () => {
    const first = rows.findIndex((r) => r.status !== "retired");
    const withRetired = rows.map((r, i) => (i === first ? { ...r, status: "retired" } : r));
    const retiredCount = withRetired.filter((r) => r.status === "retired").length;
    const hidden = groupModelRows(withRetired, false);
    expect(hidden.groups.map((g) => g.group)).toEqual(["Video", "Image", "Text", "Audio & lip sync", "Other"].filter((g) => hidden.groups.some((x) => x.group === g)));
    expect(hidden.retired).toBe(retiredCount);
    expect(retiredCount).toBeGreaterThan(rows.filter((r) => r.status === "retired").length);
    expect(hidden.groups.flatMap((g) => g.rows).some((r) => r.status === "retired")).toBe(false);
    const shown = groupModelRows(withRetired, true);
    expect(shown.groups.flatMap((g) => g.rows)).toHaveLength(rows.length);
    for (const g of shown.groups) expect(g.live).toBe(g.rows.filter((r) => r.status === "live").length);
  });
});
