import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { CreditSettings } from "@/lib/ai-models/types";
import {
  buildCreditReview,
  creditUndoPlan,
  creditUndoneMessage,
  creditWhenProblem,
  defaultCreditWhen,
  savedCreditMessage,
  serverStart,
} from "../credits-change";
import { typicalCreditRuns } from "../credits-page";

const NOW = new Date("2026-11-24T06:30:00Z");
const runs = typicalCreditRuns(seededModelCatalog(), NOW);
const row = (id: string, effectiveFrom: string, marginPercent: number, roundStep: 1 | 5 | 10): CreditSettings => ({ id, effectiveFrom, marginPercent, roundStep, note: null });
const LIVE = row("a", "2026-01-01T00:00:00Z", 0, 5);
const tomorrow = defaultCreditWhen(NOW);
const review = (draft: { marginPercent: number; roundStep: 1 | 5 | 10 }, over: Partial<Parameters<typeof buildCreditReview>[0]> = {}) =>
  buildCreditReview({ settings: [LIVE], draft, when: tomorrow, now: NOW, runs, agencyRuns: [], modelRuns: {}, ...over });

describe("When", () => {
  it("defaults to tomorrow 00:00 IST", () => {
    expect(tomorrow).toEqual({ mode: "date", date: "2026-11-25", time: "00:00" });
  });
  it("a Now start, or one inside the lead, is moved 2 minutes out, as the server does", () => {
    expect(serverStart({ ...tomorrow, mode: "now" }, NOW)?.toISOString()).toBe("2026-11-24T06:32:00.000Z");
    expect(serverStart({ mode: "date", date: "2026-11-24", time: "12:01" }, NOW)?.toISOString()).toBe("2026-11-24T06:32:00.000Z");
    expect(serverStart(tomorrow, NOW)?.toISOString()).toBe("2026-11-24T18:30:00.000Z");
  });
  it("refuses a time that can't be read, one that has passed, and a start another change has", () => {
    expect(creditWhenProblem({ ...tomorrow, time: "25:00" }, NOW, [])).toBe("Type a time like 8, 8:00, 8 pm or 20:00.");
    expect(creditWhenProblem({ ...tomorrow, date: "2026-11-24", time: "08:00" }, NOW, [])).toMatch(/^That moment has passed/);
    expect(creditWhenProblem(tomorrow, NOW, ["2026-11-24T18:30:00.000Z"])).toBe("A change already starts then. Pick another time, or cancel that change first.");
    expect(creditWhenProblem(tomorrow, NOW, ["2026-11-24T18:31:00.000Z"])).toBeNull();
    expect(creditWhenProblem({ ...tomorrow, mode: "now" }, NOW, ["2026-11-24T18:30:00.000Z"])).toBeNull();
  });
});

describe("buildCreditReview", () => {
  it("says what changes and from when, with the button to schedule it", () => {
    const r = review({ marginPercent: 10, roundStep: 10 });
    expect(r.summary).toBe("Margin 0% → 10%, Step 5 → 10");
    expect(r.startText).toBe("from 25 Nov 2026, 00:00 IST, tomorrow.");
    expect(r.confirm).toBe("Schedule for 25 Nov");
    expect(r.canSave).toBe(true);
    expect(r.rows).toHaveLength(runs.length);
    expect(r.holdNote).toEqual({ tone: "warn", text: "Credits agencies already hold will buy fewer runs." });
  });
  it("says a Now change starts 2 minutes after saving", () => {
    const r = review({ marginPercent: 10, roundStep: 5 }, { when: { ...tomorrow, mode: "now" } });
    expect(r.startText).toBe("starting 2 minutes after you save.");
    expect(r.confirm).toBe("Apply new settings");
  });
  it("warns when typical runs rise 20% or more, naming a margin of 50% or above", () => {
    expect(review({ marginPercent: 10, roundStep: 10 }).warnings.filter((w) => w.tone === "warn")).toEqual([]);
    const typo = review({ marginPercent: 100, roundStep: 5 }).warnings.find((w) => w.tone === "warn")!;
    expect(typo.text).toMatch(new RegExp(`^\\d+ of ${runs.length} typical runs cost 20% or more extra\\. Check the margin: you entered 100%\\.$`));
    const below = review({ marginPercent: 30, roundStep: 5 }).warnings.find((w) => w.tone === "warn")!;
    expect(below.text).toMatch(/cost 20% or more extra\. Check that's what you meant\.$/);
  });
  it("a cut says held credits buy more runs; the same settings have nothing to save", () => {
    const cut = buildCreditReview({ settings: [row("a", LIVE.effectiveFrom, 20, 5)], draft: { marginPercent: 0, roundStep: 5 }, when: tomorrow, now: NOW, runs, agencyRuns: [], modelRuns: {} });
    expect(cut.holdNote).toEqual({ tone: "info", text: "Credits agencies already hold will buy more runs." });
    const same = review({ marginPercent: 0, roundStep: 5 });
    expect(same).toMatchObject({ canSave: false, summary: "No change", holdNote: null });
    expect(same.warnings[0].text).toBe("These are the settings in force then. Nothing new to save.");
  });
  it("compares with the settings in force at the start, and names changes before and after it", () => {
    const earlier = row("e", "2026-11-24T12:00:00Z", 10, 5);
    const later = row("l", "2026-12-01T00:00:00Z", 30, 5);
    const r = review({ marginPercent: 20, roundStep: 5 }, { settings: [LIVE, earlier, later] });
    expect(r.before).toMatchObject({ marginPercent: 10, roundStep: 5 });
    expect(r.summary).toBe("Margin 10% → 20%");
    expect(r.warnings.map((w) => w.text)).toEqual([
      "The change scheduled for 24 Nov 2026, 17:30 IST starts first, so the new settings are compared with it.",
      "The change scheduled for 1 Dec 2026, 05:30 IST still follows and replaces these settings then.",
    ]);
  });
  it("works out each agency's month before and after", () => {
    const r = review({ marginPercent: 10, roundStep: 1 }, { agencyRuns: [{ modelId: "m", orgId: "o1", orgName: "Acme", runs: 3 }], modelRuns: { m: { usd: 0.0123, flat: null } } });
    expect(r.agencies).toEqual([{ name: "Acme", runs: 3, before: 45, after: 42, percent: ((42 - 45) / 45) * 100 }]);
  });
});

describe("after saving", () => {
  it("the toast says the start the server gave", () => {
    const requested = NOW;
    const effective = new Date(NOW.getTime() + 120_000);
    expect(savedCreditMessage({ requested, effective, now: NOW })).toBe("New credit settings start in 2 minutes, at 12:02 IST.");
    const at = new Date("2026-11-24T18:30:00Z");
    expect(savedCreditMessage({ requested: at, effective: at, now: NOW })).toBe("New credit settings scheduled for 25 Nov 2026, 00:00 IST.");
  });
  it("offers Undo only where the server would cancel", () => {
    expect(creditUndoPlan(new Date("2026-11-24T18:30:00Z"), NOW)).toBe("cancel");
    expect(creditUndoPlan(new Date(NOW.getTime() + 120_000), NOW)).toBeNull();
    expect(creditUndoPlan(new Date(NOW.getTime() + 121_000), NOW)).toBe("cancel");
  });
  it("the history's Undo says when the earlier settings come back", () => {
    expect(creditUndoneMessage(new Date("2026-11-24T06:32:00Z"))).toBe("Undone. The earlier settings come back at 12:02 IST.");
  });
});
