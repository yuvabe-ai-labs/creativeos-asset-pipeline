import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { CreditSettings } from "@/lib/ai-models/types";
import {
  NOW_WARNING,
  buildCreditReview,
  creditUndoPlan,
  creditUndoneMessage,
  dateDetail,
  defaultCreditWhen,
  restoredMessage,
  savedCreditMessage,
  settingsBefore,
} from "../credits-change";
import { typicalCreditRuns } from "../credits-page";
import { changeWhenProblem, replacedRow, serverStart } from "../change-prices-when";

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
    expect(serverStart({ ...tomorrow, mode: "now" }, NOW, "credits")?.toISOString()).toBe("2026-11-24T06:32:00.000Z");
    expect(serverStart({ mode: "date", date: "2026-11-24", time: "12:01" }, NOW, "credits")?.toISOString()).toBe("2026-11-24T06:32:00.000Z");
    expect(serverStart(tomorrow, NOW, "credits")?.toISOString()).toBe("2026-11-24T18:30:00.000Z");
  });
  it("refuses a time that can't be read, one that has passed, and a start another change has", () => {
    const at = (id: string, effectiveFrom: string) => ({ id, effectiveFrom });
    expect(changeWhenProblem({ ...tomorrow, time: "25:00" }, NOW, "credits", [], null)).toBe("Type a time like 8, 8:00, 8 pm or 20:00.");
    expect(changeWhenProblem({ ...tomorrow, date: "2026-11-24", time: "08:00" }, NOW, "credits", [], null)).toMatch(/^That moment has passed/);
    expect(changeWhenProblem(tomorrow, NOW, "credits", [at("x", "2026-11-24T18:30:00.000Z")], null)).toBe("A change already starts then. Pick another time, or cancel that change first.");
    expect(changeWhenProblem(tomorrow, NOW, "credits", [at("x", "2026-11-24T18:31:00.000Z")], null)).toBeNull();
    expect(changeWhenProblem({ ...tomorrow, mode: "now" }, NOW, "credits", [at("x", "2026-11-24T18:30:00.000Z")], null)).toBeNull();
  });
  it("an exact start of the change being replaced is not a clash", () => {
    expect(changeWhenProblem(tomorrow, NOW, "credits", [{ id: "x", effectiveFrom: "2026-11-24T18:30:00.000Z" }], "x")).toBeNull();
  });
  it("the Now warning says when, and a date names the settings that stay", () => {
    expect(NOW_WARNING).toBe("Now changes the credit cost of every model all together, 2 minutes after you save, with no notice to agencies. A date is safer.");
    expect(dateDetail({ marginPercent: 10, roundStep: 5 })).toBe("Until then, runs keep margin 10%, rounds up to the next 5 credits. Agencies get time to see it coming.");
  });
});

describe("replacing a change on the same IST day", () => {
  const scheduled = row("s", "2026-11-25T04:30:00Z", 10, 10); // 25 Nov, 10:00 IST
  it("finds a scheduled change on the start's IST day, outside the lead, for a date start only", () => {
    expect(replacedRow([LIVE, scheduled], tomorrow, NOW)).toBe(scheduled);
    expect(replacedRow([LIVE, scheduled], { ...tomorrow, date: "2026-11-26" }, NOW)).toBeNull();
    expect(replacedRow([LIVE, scheduled], { ...tomorrow, mode: "now" }, NOW)).toBeNull();
    const soon = row("z", new Date(NOW.getTime() + 60_000).toISOString(), 10, 10);
    expect(replacedRow([LIVE, soon], { mode: "date", date: "2026-11-24", time: "18:00" }, NOW)).toBeNull();
  });
  it("the settings before a start leave the replaced change out", () => {
    const earlier = row("e", "2026-11-24T12:00:00Z", 30, 5);
    expect(settingsBefore([LIVE, earlier, scheduled], { ...tomorrow, time: "12:00" }, NOW, scheduled)).toMatchObject({ marginPercent: 30 });
    expect(settingsBefore([LIVE], tomorrow, NOW, null)).toMatchObject({ marginPercent: 0, roundStep: 5 });
  });
  it("the Review compares with the replaced change, lists what it held, and the button replaces it", () => {
    const r = review({ marginPercent: 20, roundStep: 10 }, { settings: [LIVE, scheduled] });
    expect(r.replaced).toEqual({
      title: "This replaces the change scheduled for 25 Nov 2026, 10:00 IST.",
      rows: [
        { label: "Margin", scheduled: "10%", saved: "20%" },
        { label: "Rounding step", scheduled: "10 credits", saved: "Same" },
      ],
    });
    expect(r.before).toMatchObject({ marginPercent: 10, roundStep: 10 });
    expect(r.summary).toBe("Margin 10% → 20%");
    expect(r.confirm).toBe("Replace the 25 Nov change");
    expect(r.warnings.map((w) => w.text).join(" ")).not.toContain("scheduled for 25 Nov");
    expect(r.canSave).toBe(true);
  });
  it("the same settings as the replaced change have nothing to save", () => {
    const r = review({ marginPercent: 10, roundStep: 10 }, { settings: [LIVE, scheduled] });
    expect(r).toMatchObject({ canSave: false, confirm: "Nothing new to save" });
  });
  it("the toast says what was replaced, and Undo puts it back where the server allows", () => {
    const effective = new Date("2026-11-24T18:30:00Z");
    expect(savedCreditMessage({ requested: effective, effective, now: NOW, replaced: new Date(scheduled.effectiveFrom) })).toBe("The 25 Nov change is replaced. The new settings start 25 Nov 2026, 00:00 IST.");
    expect(creditUndoPlan(effective, NOW, true)).toBe("restore");
    expect(creditUndoPlan(new Date(NOW.getTime() + 120_000), NOW, true)).toBeNull();
    const back = new Date(scheduled.effectiveFrom);
    expect(restoredMessage(back, back)).toBe("Undone. The 25 Nov change is back.");
    expect(restoredMessage(back, new Date("2026-11-25T05:00:00Z"))).toBe("Undone. The earlier change is back, starting 25 Nov 2026, 10:30 IST.");
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
    expect(r.holdNote?.tone).toBe("warn");
    expect(r.holdNote?.text).toMatch(/^Credits agencies hold buy about \d+% fewer runs\.$/);
    expect(r.examples).toHaveLength(3);
    expect(r.agencySummary).toBeNull();
  });
  it("says a Now change starts 2 minutes after saving", () => {
    const r = review({ marginPercent: 10, roundStep: 5 }, { when: { ...tomorrow, mode: "now" } });
    expect(r.startText).toBe("starting 2 minutes after you save.");
    expect(r.confirm).toBe("Apply new settings");
  });
  it("warns when typical runs rise 20% or more, naming a margin of 50% or above", () => {
    expect(review({ marginPercent: 10, roundStep: 5 }).warnings.filter((w) => w.tone === "warn")).toEqual([]);
    const typo = review({ marginPercent: 100, roundStep: 5 }).warnings.find((w) => w.tone === "warn")!;
    expect(typo.text).toMatch(new RegExp(`^\\d+ of ${runs.length} typical runs cost 20% or more extra\\. Check the margin: you entered 100%\\.$`));
    const below = review({ marginPercent: 30, roundStep: 5 }).warnings.find((w) => w.tone === "warn")!;
    expect(below.text).toMatch(/cost 20% or more extra\. Check that's what you meant\.$/);
  });
  it("a cut says held credits buy more runs; the same settings have nothing to save", () => {
    const cut = buildCreditReview({ settings: [row("a", LIVE.effectiveFrom, 20, 5)], draft: { marginPercent: 0, roundStep: 5 }, when: tomorrow, now: NOW, runs, agencyRuns: [], modelRuns: {} });
    expect(cut.holdNote?.tone).toBe("info");
    expect(cut.holdNote?.text).toMatch(/^Credits agencies hold buy about \d+% more runs\.$/);
    const same = review({ marginPercent: 0, roundStep: 5 });
    expect(same).toMatchObject({ canSave: false, summary: "No change", holdNote: null, confirm: "Nothing new to save" });
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
    // Held credits follow this month's runs by model, not the typical runs: 45 → 42 is about 7% more runs.
    expect(r.agencySummary).toBe("The one agency with runs this month would have used about 7% fewer credits for the same work.");
    expect(r.holdNote).toEqual({ tone: "info", text: "Credits agencies hold buy about 7% more runs." });
  });
  it("names typical runs that rounding pushes up more than the rest", () => {
    const push = review({ marginPercent: 0, roundStep: 10 }, { settings: [row("a", LIVE.effectiveFrom, 0, 1)] }).warnings.find((w) => w.text.includes("rounding weighs more on cheap runs"));
    expect(push?.tone).toBe("warn");
    expect(push?.text).toMatch(/^GPT Image 2, low quality square image, no reference \(\+43%\)/);
  });
});

describe("after saving", () => {
  it("the toast says the start the server gave", () => {
    const requested = NOW;
    const effective = new Date(NOW.getTime() + 120_000);
    expect(savedCreditMessage({ requested, effective, now: NOW, replaced: null })).toBe("New credit settings start in 2 minutes, at 12:02 IST.");
    const at = new Date("2026-11-24T18:30:00Z");
    expect(savedCreditMessage({ requested: at, effective: at, now: NOW, replaced: null })).toBe("New credit settings scheduled for 25 Nov 2026, 00:00 IST.");
  });
  it("offers Undo only where the server would cancel", () => {
    expect(creditUndoPlan(new Date("2026-11-24T18:30:00Z"), NOW, false)).toBe("cancel");
    expect(creditUndoPlan(new Date(NOW.getTime() + 120_000), NOW, false)).toBeNull();
    expect(creditUndoPlan(new Date(NOW.getTime() + 121_000), NOW, false)).toBe("cancel");
  });
  it("the history's Undo says when the earlier settings come back", () => {
    expect(creditUndoneMessage(new Date("2026-11-24T06:32:00Z"))).toBe("Undone. The earlier settings come back at 12:02 IST.");
  });
});
