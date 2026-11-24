import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { CreditSettings } from "@/lib/ai-models/types";
import { TYPICAL_RUNS, runCredits, typicalRunRows } from "../typical-runs";
import {
  PROMPT_FLAT_NOTE,
  agencyCreditImpact,
  settingsChangeWords,
  creditHistory,
  creditRunRows,
  creditsFor,
  creditsSummary,
  modelTypicalRuns,
  parseMargin,
  roundingNote,
  settingsWords,
  stepWords,
  typicalCreditRuns,
  workedExample,
  type CreditHistoryRow,
} from "../credits-page";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z");
const ZERO = { marginPercent: 0, roundStep: 5 as const };
const TEN = { marginPercent: 10, roundStep: 10 as const };

describe("words", () => {
  it("names the step and the settings", () => {
    expect(stepWords(1)).toBe("the next credit");
    expect(stepWords(5)).toBe("the next 5 credits");
    expect(settingsWords(ZERO)).toBe("margin 0%, rounds up to the next 5 credits");
    expect(settingsChangeWords(ZERO, TEN)).toBe("Margin 0% → 10%, Step 5 → 10");
    expect(settingsChangeWords(ZERO, { marginPercent: 0, roundStep: 1 })).toBe("Step 5 → 1");
    expect(settingsChangeWords(ZERO, ZERO)).toBe("");
  });
});

describe("workedExample", () => {
  it("is the owner's simple example at margin 0, step 5", () => {
    const w = workedExample(ZERO);
    expect(w.sentence).toBe("A run that costs us $0.0123 is 12.3 credits, which rounds up to 15.");
    expect(w).toMatchObject({ usd: "$0.0123", atCost: "12.3", withMargin: null, charged: 15, was: null });
  });
  it("follows the margin and step it is given, and says what the live settings charge", () => {
    const w = workedExample({ marginPercent: 10, roundStep: 1 }, ZERO);
    expect(w.sentence).toBe("A run that costs us $0.0123 is 12.3 credits, 13.53 with the 10% margin, which rounds up to 14.");
    expect(w).toMatchObject({ withMargin: "13.53", charged: 14, was: 15 });
    expect(workedExample({ marginPercent: 10, roundStep: 5 }, ZERO).was).toBeNull();
  });
});

describe("parseMargin", () => {
  it.each([["10", 10], ["10%", 10], [" 12.5 ", 12.5], ["0", 0], ["200", 200], ["33.33", 33.33]])("reads %j", (t, n) => {
    expect(parseMargin(t)).toBe(n);
  });
  it.each(["", "abc", "-1", "−5", "201", "1.234", "1e2", "10.", "1,5"])("refuses %j, as the server does", (t) => {
    expect(parseMargin(t)).toBeNull();
  });
});

describe("typical credit runs", () => {
  const runs = typicalCreditRuns(catalog, NOW);
  it("are TYPICAL_RUNS, charged exactly as runCredits charges them, under any settings", () => {
    const rows = typicalRunRows(catalog, NOW);
    expect(runs).toHaveLength(TYPICAL_RUNS.length);
    for (const s of [ZERO, TEN, { marginPercent: 37.5, roundStep: 1 as const }, { marginPercent: 200, roundStep: 5 as const }]) {
      runs.forEach((r, i) => expect(creditsFor(r, s)).toBe(runCredits(rows[i].model, rows[i].price, rows[i].spec, s)));
    }
  });
  it("marks the prompt run as flat, so margin and step leave it alone", () => {
    const prompt = runs.find((r) => r.label.startsWith("Prompt run"))!;
    expect(prompt.flat).not.toBeNull();
    expect(creditsFor(prompt, ZERO)).toBe(creditsFor(prompt, TEN));
    expect(runs.filter((r) => r.flat !== null)).toHaveLength(1);
  });
  it("shows rounding notes where rounding adds 15% or more, and the flat note on prompt runs", () => {
    const rows = creditRunRows(runs, ZERO, null);
    const low = rows.find((r) => r.name === "GPT Image 2" && r.label.startsWith("Low"))!;
    expect(low.usd).toBe("$0.00695");
    expect(low.note).toEqual({ tone: "rounding", text: "$0.00695 is 6.95 credits, rounded up to 10 (+44%). With a step of 1 it would be 7." });
    expect(rows.find((r) => r.label.startsWith("Prompt run"))!.note).toEqual({ tone: "flat", text: PROMPT_FLAT_NOTE });
    expect(rows.every((r) => r.after === null && r.percent === null)).toBe(true);
  });
  it("compares before and after with a percent, and none where nothing changes", () => {
    const rows = creditRunRows(runs, ZERO, TEN);
    const omni = rows[0];
    expect(omni.before).toBe(creditsFor(runs[0], ZERO));
    expect(omni.after).toBe(creditsFor(runs[0], TEN));
    expect(omni.percent).toBeCloseTo(((omni.after! - omni.before) / omni.before) * 100, 9);
    expect(rows.find((r) => r.label.startsWith("Prompt run"))!.percent).toBeNull();
  });
  it("a rounding note uses the new settings and leaves out the step-of-1 line at step 1", () => {
    expect(roundingNote(0.00695, { marginPercent: 10, roundStep: 10 })).toBe("$0.00695 is 7.645 credits, rounded up to 10 (+31%). With a step of 1 it would be 8.");
    expect(roundingNote(0.00695, { marginPercent: 0, roundStep: 1 })).toBeNull();
    expect(roundingNote(0.81088, ZERO)).toBeNull();
  });
});

describe("agencyCreditImpact", () => {
  const runs = { a: { usd: 0.0123, flat: null }, p: { usd: 0.00875, flat: 8.75 } };
  it("adds up each agency's month at each model's typical run, busiest first", () => {
    const rows = agencyCreditImpact(
      [
        { modelId: "a", orgId: "s", orgName: "Small", runs: 2 },
        { modelId: "a", orgId: "b", orgName: "Big", runs: 10 },
        { modelId: "p", orgId: "b", orgName: "Big", runs: 4 },
        { modelId: "gone", orgId: "b", orgName: "Big", runs: 1 },
      ],
      runs,
      ZERO,
      { marginPercent: 10, roundStep: 1 },
    );
    expect(rows.map((r) => r.name)).toEqual(["Big", "Small"]);
    expect(rows[0]).toMatchObject({ runs: 15, before: 10 * 15 + 4 * 8.75, after: 10 * 14 + 4 * 8.75 });
    expect(rows[1]).toMatchObject({ runs: 2, before: 30, after: 28 });
    expect(rows[1].percent).toBeCloseTo(((28 - 30) / 30) * 100, 9);
  });
  it("has no credits for an agency whose models have no typical run", () => {
    expect(agencyCreditImpact([{ modelId: "gone", orgId: "x", orgName: "X", runs: 3 }], runs, ZERO, TEN)[0]).toEqual({ name: "X", runs: 3, before: null, after: null, percent: null });
  });
  it("prices each model once from the catalog", () => {
    const r = modelTypicalRuns(catalog, ["gemini:gemini-omni-1.1-flash", "nope", "gemini:gemini-omni-1.1-flash"], NOW);
    expect(Object.keys(r)).toEqual(["gemini:gemini-omni-1.1-flash"]);
    expect(r["gemini:gemini-omni-1.1-flash"].flat).toBeNull();
  });
});

const setting = (id: string, effectiveFrom: string, marginPercent: number, roundStep: 1 | 5 | 10, note: string | null = null): CreditSettings => ({ id, effectiveFrom, marginPercent, roundStep, note });
const hist = (s: CreditSettings | null, over: Partial<CreditHistoryRow> & { id: string; effectiveFrom: string }): CreditHistoryRow => ({
  createdAt: "2026-11-24T05:00:00Z", createdBy: "u1", createdByName: "Arun", settings: s, problems: s ? [] : ["bad step"], ...over,
});

describe("creditsSummary", () => {
  it("says the live settings and the next change", () => {
    const rows = [setting("a", "2026-01-01T00:00:00Z", 0, 5), setting("b", "2026-11-24T18:30:00Z", 10, 10)];
    expect(creditsSummary(rows, ZERO, NOW)).toEqual({
      line: "1 credit = $0.001 · margin 0% · rounds up to the next 5 credits",
      next: { when: "25 Nov 2026, 00:00 IST", utc: "18:30 UTC on 24 Nov", text: "margin 10%, rounds up to the next 10 credits." },
    });
    expect(creditsSummary(rows.slice(0, 1), ZERO, NOW).next).toBeNull();
  });
});

describe("creditHistory", () => {
  const old = setting("a", "2026-01-01T00:00:00Z", 0, 5);
  const live = setting("b", "2026-11-24T06:00:00Z", 10, 5);
  it("lists newest first with what changed, and Cancel only outside the 2-minute lead", () => {
    const soon = setting("s", new Date(NOW.getTime() + 90_000).toISOString(), 10, 10);
    const later = setting("l", "2026-11-24T18:30:00Z", 20, 10);
    const t = creditHistory(
      [hist(old, { id: "a", effectiveFrom: old.effectiveFrom, createdBy: null, createdByName: null, createdAt: "2026-01-01T00:00:00Z" }), hist(live, { id: "b", effectiveFrom: live.effectiveFrom }), hist(soon, { id: "s", effectiveFrom: soon.effectiveFrom }), hist(later, { id: "l", effectiveFrom: later.effectiveFrom })],
      { now: NOW, callerId: "u1" },
    );
    expect(t.items.map((i) => [i.id, i.state, i.badge, i.summary, i.canCancel, i.canUndo])).toEqual([
      ["l", "next", "Next, tomorrow", "Margin 10% → 20%", true, false],
      ["s", "next", "Next, today", "Step 5 → 10", false, false],
      ["b", "now", "Live now", "Margin 0% → 10%", false, false],
      ["a", "past", "Past", "Margin 0%, rounds up to the next 5 credits", false, false],
    ]);
    expect(t.items[0]).toMatchObject({ when: "From 25 Nov 2026, 00:00 IST", utc: "18:30 UTC on 24 Nov", name: "the 25 Nov change", who: "Added by Arun on 24 Nov 2026" });
    expect(t.items[3]).toMatchObject({ when: "Since 1 Jan 2026", utc: null, who: "Added on 1 Jan 2026" });
  });
  it("offers Undo on the live row only where the server would take it", () => {
    const rows = [hist(old, { id: "a", effectiveFrom: old.effectiveFrom }), hist(live, { id: "b", effectiveFrom: live.effectiveFrom })];
    expect(creditHistory(rows, { now: NOW, callerId: "u1" }).items[0].canUndo).toBe(true);
    // Another admin's change, or one older than 24 hours.
    expect(creditHistory(rows, { now: NOW, callerId: "u2" }).items[0].canUndo).toBe(false);
    expect(creditHistory(rows, { now: new Date(NOW.getTime() + 25 * 3_600_000), callerId: "u1" }).items[0].canUndo).toBe(false);
    // A change is scheduled: cancel it first.
    const next = setting("n", "2026-12-01T00:00:00Z", 5, 5);
    expect(creditHistory([...rows, hist(next, { id: "n", effectiveFrom: next.effectiveFrom })], { now: NOW, callerId: "u1" }).items[1].canUndo).toBe(false);
    // No earlier settings, or the earlier row fails its check.
    expect(creditHistory(rows.slice(1), { now: NOW, callerId: "u1" }).items[0].canUndo).toBe(false);
    expect(creditHistory([hist(null, { id: "a", effectiveFrom: old.effectiveFrom }), rows[1]], { now: NOW, callerId: "u1" }).items[0].canUndo).toBe(false);
  });
  it("shows a row that fails its check with its problems and no summary", () => {
    const t = creditHistory([hist(old, { id: "a", effectiveFrom: old.effectiveFrom }), hist(null, { id: "x", effectiveFrom: "2026-06-01T00:00:00Z" })], { now: NOW, callerId: "u1" });
    expect(t.items[1]).toMatchObject({ id: "a", state: "now" });
    expect(t.items[0]).toMatchObject({ id: "x", broken: true, badge: "Fails its check", summary: null, problems: ["bad step"] });
  });
});
