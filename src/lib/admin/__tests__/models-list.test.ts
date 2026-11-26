import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { creditsFromUsd } from "@/lib/credits/units";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { runCostUsd, runCredits, runSpec } from "../typical-runs";
import {
  CHANGED_DAYS,
  buildModelsList,
  groupOfKind,
  kindRank,
  priceDiff,
  typicalRunWords,
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
  it("makes one row per model with its starting price, typical run and no next change", () => {
    const { rows } = buildModelsList(input());
    expect(rows).toHaveLength(catalog.models.length);
    const omni = rows.find((r) => r.id === OMNI11)!;
    expect(omni.label).toBe(model(OMNI11).label);
    expect(omni.provider).toBe(model(OMNI11).providerLabel);
    expect(omni.group).toBe("Video");
    expect(omni.kind).toBe("video");
    expect(omni.order).toBe(catalog.models.findIndex((m) => m.id === OMNI11));
    expect(omni.price).toMatchObject({ kind: "price", unit: "a second" });
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

  it("calls any priced row with no typical run charged at cost", () => {
    const { rows } = buildModelsList(input());
    for (const r of rows) expect(r.atCost, r.id).toBe(r.price !== null && r.typical === null);
  });

  it("flags a model whose only price row fails its check, not as having no price", () => {
    const { attention } = buildModelsList(input({
      prices: pastPrices.filter((p) => p.modelId !== OMNI11),
      brokenPriceModelIds: [OMNI11],
    }));
    const items = attention.filter((a) => a.modelId === OMNI11);
    expect(items.map((a) => a.text)).toEqual(["has a price that fails its check"]);
    expect(items[0]).toMatchObject({ tone: "bad", name: model(OMNI11).label, action: "Open" });
  });

  it("puts a credit settings row that fails its check at the top", () => {
    const { attention } = buildModelsList(input({
      creditSettings: [settings(0, 5), settings(20, 10, "2026-12-02T18:30:00Z")],
      brokenCreditSettings: true,
    }));
    expect(attention[0]).toMatchObject({ key: "credit-settings-broken", tone: "bad", text: "A credit settings change fails its check", href: "/admin/credits" });
    expect(attention[1].key).toBe("credit-settings");
  });

  it("shows this month's runs and cost when the model ran", () => {
    const { rows } = buildModelsList(input({ stats: [{ modelId: OMNI11, runs: 174, costUsd: 101.08 }] }));
    expect(rows.find((r) => r.id === OMNI11)!.month).toEqual({ runs: 174, costUsd: 101.08 });
  });

  it("chips the seeded 3 Dec drop with the typical run's credits after it, and lists it under Needs a look", () => {
    const { rows, attention } = buildModelsList(input({ prices: catalog.prices }));
    const omni = rows.find((r) => r.id === OMNI11)!;
    const m = model(OMNI11);
    const future = catalog.prices.find((p) => p.modelId === OMNI11 && new Date(p.effectiveFrom) > NOW)!;
    const after = runCredits(m, future, runSpec(m, future)!, settings(0, 5));
    expect(omni.next).toEqual({ chip: "−31%", tone: "down", date: "3 Dec", when: "Starts 3 Dec 2026, 13:30 IST.", credits: after });
    expect(after).toBeLessThan(omni.typical!.credits);
    const item = attention.find((a) => a.modelId === OMNI11)!;
    expect(item.tone).toBe("next");
    expect(item.name).toBe(m.label);
    expect(item.text).toBe("prices drop 31% on 3 Dec, in 9 days");
    expect(item.detail).toBe(`A typical run goes from ${omni.typical!.credits.toLocaleString("en-US")} to ${after!.toLocaleString("en-US")} credits.`);
    expect(item.action).toBe("Review");
    expect(item.href).toBe(`/admin/models/${encodeURIComponent(OMNI11)}?change=1`);
  });

  it("marks a rise of 50% or more as big", () => {
    const future = scaled(OMNI11, 2, "2027-01-01T00:00:00Z");
    const { rows, attention } = buildModelsList(input({ prices: [...pastPrices, future] }));
    expect(rows.find((r) => r.id === OMNI11)!.next).toMatchObject({ chip: "+100%", tone: "big", date: "1 Jan" });
    expect(attention.find((a) => a.modelId === OMNI11)!.text).toBe("prices rise 100% on 1 Jan, in 38 days");
  });

  it("says Change when prices move by different amounts", () => {
    const p = latest(OMNI11);
    const future: AiModelPrice = {
      ...p, id: "f", effectiveFrom: "2026-12-03T08:00:00Z",
      lines: p.lines.map((l, i) => ({ ...l, unit_usd: l.unit_usd * (i === 0 ? 0.5 : 1.1) })),
    };
    const { rows, attention } = buildModelsList(input({ prices: [...pastPrices, future] }));
    expect(rows.find((r) => r.id === OMNI11)!.next?.chip).toBe("Change");
    expect(attention.find((a) => a.modelId === OMNI11)!.text).toMatch(/^\d+ prices −50% to \+10% on 3 Dec, in 9 days$/);
  });

  it("flags a model with no price under Needs a look, with Add prices", () => {
    const id = OMNI11;
    const { rows, attention } = buildModelsList(input({
      models: catalog.models.map((m) => ({ model: m.id === id ? { ...m, status: "draft" as const } : m, raw: { id: m.id }, problems: [] })),
      prices: pastPrices.filter((p) => p.modelId !== id),
    }));
    const row = rows.find((r) => r.id === id)!;
    expect(row.price).toBeNull();
    expect(row.typical).toBeNull();
    const item = attention.find((a) => a.modelId === id)!;
    expect(item).toMatchObject({ tone: "warn", text: "has no price, so agencies can't use it yet", detail: "", action: "Add prices" });
    expect(item.href).toMatch(/\?change=1$/);
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

describe("Price changed", () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * day).toISOString();

  it("dates a price that replaced an earlier one within the last 14 days", () => {
    const { rows } = buildModelsList(input({ prices: [...pastPrices, scaled(OMNI11, 0.9, at(3))] }));
    expect(rows.find((r) => r.id === OMNI11)!.changed).toBe("21 Nov");
  });

  it("says nothing once it is older, or when it is the first price", () => {
    const old = buildModelsList(input({ prices: [...pastPrices, scaled(OMNI11, 0.9, at(CHANGED_DAYS + 1))] }));
    expect(old.rows.find((r) => r.id === OMNI11)!.changed).toBeNull();
    const first = buildModelsList(input({ prices: [{ ...latest(OMNI11), effectiveFrom: at(2) }] }));
    expect(first.rows.find((r) => r.id === OMNI11)!.changed).toBeNull();
  });
});

describe("typicalRunWords", () => {
  it("words a change, no change, a first price and none", () => {
    expect(typicalRunWords(815, 560)).toBe("A typical run goes from 815 to 560 credits.");
    expect(typicalRunWords(1200, 1500)).toBe("A typical run goes from 1,200 to 1,500 credits.");
    expect(typicalRunWords(40, 40)).toBe("A typical run stays at 40 credits.");
    expect(typicalRunWords(null, 30)).toBe("A typical run will be 30 credits.");
    expect(typicalRunWords(30, null)).toBe("");
  });
});

describe("kindRank", () => {
  it("lists image before edit and unknown kinds last", () => {
    expect(kindRank("image")).toBeLessThan(kindRank("edit"));
    expect(kindRank("dub")).toBeLessThan(kindRank("transcribe"));
    expect(kindRank("something-new")).toBeGreaterThan(kindRank("scrape"));
  });
});
