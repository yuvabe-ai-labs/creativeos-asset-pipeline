import { describe, expect, it } from "vitest";
import { changeCreditsReducer, closedCreditFlow, creditDraft, type CreditFlow } from "../use-change-credit-settings";

const NOW = new Date("2026-11-24T06:30:00Z");
const LIVE = { marginPercent: 0, roundStep: 5 as const };
const run = (s: CreditFlow, ...actions: Parameters<typeof changeCreditsReducer>[1][]) => actions.reduce(changeCreditsReducer, s);
const open = run(closedCreditFlow, { type: "start", live: LIVE, now: NOW });

describe("changeCreditsReducer", () => {
  it("starts from the live settings, with the start at tomorrow 00:00 IST", () => {
    expect(open).toEqual({ stage: "settings", margin: "0", step: 5, when: { mode: "date", date: "2026-11-25", time: "00:00" }, saving: false });
  });
  it("types a margin and picks a step", () => {
    const s = run(open, { type: "margin", text: "10" }, { type: "step", step: 10 });
    expect(s).toMatchObject({ margin: "10", step: 10 });
  });
  it("fills in a scheduled change when given one", () => {
    const from = { settings: { marginPercent: 10, roundStep: 10 as const }, when: { mode: "date" as const, date: "2026-12-01", time: "00:00" } };
    expect(run(closedCreditFlow, { type: "start", live: LIVE, now: NOW, from })).toMatchObject({ stage: "settings", margin: "10", step: 10, when: from.when });
  });
  it("goes to When and Review, Back steps back, and Esc closes the flow", () => {
    const review = run(open, { type: "go", stage: "when" }, { type: "go", stage: "review" });
    expect(review.stage).toBe("review");
    expect(run(review, { type: "back" }).stage).toBe("when");
    expect(run(review, { type: "back" }, { type: "back" }).stage).toBe("settings");
    expect(run(review, { type: "close" })).toEqual(closedCreditFlow);
    expect(run(open, { type: "close" })).toEqual(closedCreditFlow);
  });
  it("changes the When by parts", () => {
    expect(run(open, { type: "when", when: { mode: "now" } }).when).toEqual({ mode: "now", date: "2026-11-25", time: "00:00" });
  });
  it("holds still while saving, then closes; a stale start returns to When", () => {
    const saving = run(open, { type: "go", stage: "review" }, { type: "saving", on: true });
    expect(run(saving, { type: "back" })).toBe(saving);
    expect(run(saving, { type: "close" })).toBe(saving);
    expect(run(saving, { type: "done" })).toEqual(closedCreditFlow);
    expect(run(saving, { type: "stale" })).toMatchObject({ stage: "when", saving: false });
  });
});

describe("creditDraft", () => {
  it("is invalid with a margin the server would refuse", () => {
    expect(creditDraft({ ...open, margin: "250" }, LIVE)).toEqual({ settings: null, changed: false, summary: null, canGoOn: false });
    expect(creditDraft({ ...open, margin: "" }, LIVE).settings).toBeNull();
  });
  it("says what changes from the live settings", () => {
    expect(creditDraft({ ...open, margin: "10%", step: 10 }, LIVE)).toEqual({ settings: { marginPercent: 10, roundStep: 10 }, changed: true, summary: "Margin 0% → 10%, Step 5 → 10", canGoOn: true });
  });
  it("goes on with today's settings too, so a return to them can be scheduled; the Review decides", () => {
    expect(creditDraft(open, LIVE)).toEqual({ settings: LIVE, changed: false, summary: "", canGoOn: true });
  });
});
