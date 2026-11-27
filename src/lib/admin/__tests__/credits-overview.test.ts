import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { CreditSettings } from "@/lib/ai-models/types";
import { DEFAULT_CREDIT_SETTINGS } from "@/lib/credits/units";
import { modelTypicalRuns, typicalCreditRuns } from "../credits-page";
import { agencyMonthWords, exampleRuns, heldRunsChange, heldWords, nextCreditChange, nowRow, referenceRun } from "../credits-overview";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z");
const runs = typicalCreditRuns(catalog, NOW);
const row = (id: string, effectiveFrom: string, marginPercent: number, roundStep: 1 | 5 | 10): CreditSettings => ({ id, effectiveFrom, marginPercent, roundStep, note: null });
const LIVE = row("a", "2026-01-01T00:00:00Z", 0, 5);
const ZERO = { marginPercent: 0, roundStep: 5 as const };

describe("referenceRun", () => {
  it("is the typical run of the model with the most runs this month", () => {
    const priced = Object.keys(modelTypicalRuns(catalog, catalog.models.map((m) => m.id), NOW));
    const [a, b] = priced.filter((id) => modelTypicalRuns(catalog, [id], NOW)[id].flat === null);
    const ref = referenceRun(catalog, [
      { modelId: a, orgId: "o1", orgName: "A", runs: 2 },
      { modelId: b, orgId: "o1", orgName: "A", runs: 3 },
      { modelId: a, orgId: "o2", orgName: "B", runs: 4 },
    ], NOW);
    expect(ref?.name).toBe(catalog.models.find((m) => m.id === a)!.label);
  });
  it("with no runs, is the first live video model in picker order", () => {
    const first = catalog.models.filter((m) => m.kind === "video" && m.status === "live").sort((x, y) => x.sortOrder - y.sortOrder || x.id.localeCompare(y.id))
      .find((m) => modelTypicalRuns(catalog, [m.id], NOW)[m.id]);
    expect(referenceRun(catalog, [], NOW)?.name).toBe(first!.label);
  });
  it("skips a model with no priced run", () => {
    expect(referenceRun({ models: [], prices: [] }, [{ modelId: "gone", orgId: "o", orgName: "O", runs: 9 }], NOW)).toBeNull();
  });
});

describe("exampleRuns", () => {
  it("takes the first run of each kind that a change moves, three at most", () => {
    const ex = exampleRuns(runs);
    expect(ex).toHaveLength(3);
    expect(new Set(ex.map((r) => r.kind)).size).toBe(3);
    expect(ex.every((r) => r.flat === null)).toBe(true);
    expect(ex[0]).toBe(runs.find((r) => r.flat === null));
  });
});

describe("held credits and the agencies' month", () => {
  const mix = { runs, agencyRuns: [{ modelId: "m", orgId: "o", orgName: "Acme", runs: 3 }], modelRuns: { m: { usd: 0.0123, flat: null } } };
  it("weighs by this month's runs when there are any, else by the typical runs", () => {
    // 3 runs at 15 credits each, then 3 at 25: the same credits buy 40% fewer runs.
    expect(heldRunsChange(ZERO, { marginPercent: 100, roundStep: 5 }, mix)).toBeCloseTo(-40);
    expect(heldRunsChange(ZERO, { marginPercent: 100, roundStep: 5 }, { ...mix, agencyRuns: [] })).toBeLessThan(0);
  });
  it("says it in words", () => {
    expect(heldWords(-40)).toBe("Credits agencies hold buy about 40% fewer runs.");
    expect(heldWords(7.1)).toBe("Credits agencies hold buy about 7% more runs.");
    expect(heldWords(0.2)).toBe("Credits agencies hold buy about the same number of runs.");
    expect(heldWords(null)).toBeNull();
  });
  it("sums the agencies' month", () => {
    const a = (name: string, before: number | null, after: number | null) => ({ name, runs: 1, before, after, percent: null });
    expect(agencyMonthWords([a("A", 100, 110), a("B", 100, 110), a("C", null, null)])).toBe("The 3 agencies with runs this month would have used about 10% more credits for the same work.");
    expect(agencyMonthWords([a("C", null, null)])).toBeNull();
    expect(agencyMonthWords([])).toBeNull();
  });
});

describe("Now and Next", () => {
  it("Now says the settings and since when, or that they are the default", () => {
    expect(nowRow(LIVE)).toEqual({ line: "Margin 0% · rounds up to the next 5 credits", since: "Since 1 Jan 2026" });
    expect(nowRow(DEFAULT_CREDIT_SETTINGS).since).toBe("Default, none saved yet");
  });
  it("Next is the first change that hasn't started, compared with the settings before it", () => {
    const first = row("n", "2026-12-01T18:30:00Z", 10, 5);
    const later = row("l", "2026-12-10T18:30:00Z", 20, 10);
    const next = nextCreditChange({ settings: [LIVE, later, first], now: NOW, reference: { name: "Kling 3.0", usd: 0.62, flat: null }, runs, agencyRuns: [], modelRuns: {} })!;
    expect(next).toMatchObject({
      id: "n",
      name: "the 2 Dec change",
      when: "2 Dec 2026, 00:00 IST",
      lead: "Margin 0% → 10%",
      run: "A typical Kling 3.0 run goes from 620 to 685 credits.",
      more: 1,
      canCancel: true,
      kept: "Runs keep margin 0%, rounds up to the next 5 credits.",
      restore: { effectiveFrom: first.effectiveFrom, marginPercent: 10, roundStep: 5, note: null },
    });
    expect(next.held).toMatch(/^Credits agencies hold buy about \d+% fewer runs\.$/);
  });
  it("can't be cancelled inside the lead, and is null with nothing scheduled", () => {
    const soon = row("s", new Date(NOW.getTime() + 60_000).toISOString(), 10, 5);
    expect(nextCreditChange({ settings: [LIVE, soon], now: NOW, reference: null, runs, agencyRuns: [], modelRuns: {} })).toMatchObject({ canCancel: false, run: null });
    expect(nextCreditChange({ settings: [LIVE], now: NOW, reference: null, runs, agencyRuns: [], modelRuns: {} })).toBeNull();
  });
  it("a run the change doesn't move stays", () => {
    const step = row("n", "2026-12-01T18:30:00Z", 0, 10);
    expect(nextCreditChange({ settings: [LIVE, step], now: NOW, reference: { name: "X", usd: 0.62, flat: null }, runs, agencyRuns: [], modelRuns: {} })?.run).toBe("A typical X run stays at 620 credits.");
  });
});
