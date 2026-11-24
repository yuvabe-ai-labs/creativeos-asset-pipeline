import { describe, expect, it } from "vitest";
import { changePricesReducer, closedFlow, defaultWhens, type FlowState } from "../change-prices/use-change-prices";

const NOW = new Date("2026-11-24T06:30:00Z");
const NEXT = { effectiveFrom: "2026-12-03T08:00:00.000Z" };
const whens = defaultWhens(NEXT, NOW);
const run = (s: FlowState, ...actions: Parameters<typeof changePricesReducer>[1][]) => actions.reduce(changePricesReducer, s);

describe("defaultWhens", () => {
  it("today's prices start now (date field at tomorrow 00:00); the scheduled change keeps its start", () => {
    expect(whens.live).toEqual({ mode: "now", date: "2026-11-25", time: "00:00" });
    expect(whens.next).toEqual({ mode: "date", date: "2026-12-03", time: "13:30" });
    expect(defaultWhens(null, NOW).next).toBeNull();
  });
});

describe("changePricesReducer", () => {
  it("with a change scheduled, asks first, defaulting to editing it", () => {
    const s = run(closedFlow, { type: "start", whens });
    expect(s.stage).toBe("choose");
    expect(s.pick).toBe("next");
    const edit = run(s, { type: "choose" });
    expect(edit).toMatchObject({ stage: "prices", base: "next", when: whens.next, keysOpen: true, keysSeen: true });
    const fresh = run(s, { type: "pick", pick: "live" }, { type: "choose" });
    expect(fresh).toMatchObject({ stage: "prices", base: "live", when: whens.live });
  });

  it("without one, goes straight to the grid from today's prices", () => {
    const s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) });
    expect(s).toMatchObject({ stage: "prices", base: "live", keysOpen: true });
  });

  it("shows the keyboard help only the first time", () => {
    const s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "cancel" }, { type: "start", whens: defaultWhens(null, NOW) });
    expect(s.keysOpen).toBe(false);
  });

  it("choosing again starts the cells over", () => {
    const s = run(closedFlow, { type: "start", whens }, { type: "choose" }, { type: "type", key: "a", text: "1" }, { type: "rechoose" });
    expect(s).toMatchObject({ stage: "choose", pick: "next" });
    expect(run(s, { type: "choose" }).values).toEqual({});
  });

  it("typing a cell makes it hand-typed; Esc puts it back", () => {
    let s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "bulkText", text: "-10" });
    s = run(s, { type: "bulkApply", cells: [{ key: "a", amount: 0.1 }], otherCharges: [], hasOtherCharges: false });
    expect(s.values).toEqual({ a: "0.09" });
    expect(s.percentKeys).toEqual(["a"]);
    s = run(s, { type: "type", key: "a", text: "0.2" });
    expect(s.percentKeys).toEqual([]);
    s = run(s, { type: "reset", key: "a" });
    expect(s.values).toEqual({});
  });

  it("bulk: applies with or without other charges, and explains a percent it can't use", () => {
    const base = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) });
    const targets = { cells: [{ key: "a", amount: 0.1 }], otherCharges: [{ key: "t", amount: 1.5, atCost: false }], hasOtherCharges: true };
    const left = run(base, { type: "bulkText", text: "−31" }, { type: "includeOther", on: false }, { type: "bulkApply", ...targets });
    expect(left.values).toEqual({ a: "0.069" });
    expect(left.bulkMessage).toEqual({ tone: "info", text: "Changed 1 price by −31%, rounded to 4 significant figures. Other charges were left out." });
    const all = run(base, { type: "bulkText", text: "−31" }, { type: "bulkApply", ...targets });
    expect(all.values).toEqual({ a: "0.069", t: "1.035" });
    expect(run(base, { type: "bulkText", text: "" }, { type: "bulkApply", ...targets }).bulkMessage).toEqual({ tone: "error", text: "Type a percent first, like −31 or 20." });
    const tooLow = run(base, { type: "bulkText", text: "-150" }, { type: "bulkApply", ...targets });
    expect(tooLow.values).toEqual({});
    expect(tooLow.bulkMessage).toEqual({ tone: "error", text: "A price can't go down by more than 100%." });
  });

  it("steps through When and Review, and Back or Esc returns a step", () => {
    let s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "step", stage: "when" });
    s = run(s, { type: "when", when: { mode: "date" } }, { type: "when", when: { time: "8 pm" } });
    expect(s.when).toEqual({ mode: "date", date: "2026-11-25", time: "8 pm" });
    s = run(s, { type: "step", stage: "review" }, { type: "back" });
    expect(s.stage).toBe("when");
    expect(run(s, { type: "back" }).stage).toBe("prices");
  });

  it("closes once saved and ignores a second save while one runs", () => {
    const s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "step", stage: "review" }, { type: "saving", on: true });
    expect(s.saving).toBe(true);
    expect(run(s, { type: "back" }).stage).toBe("review");
    expect(run(s, { type: "done" })).toMatchObject({ stage: "closed", saving: false, keysSeen: true });
  });
});

describe("review fixes", () => {
  const atReview = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "step", stage: "when" }, { type: "step", stage: "review" });
  it("Esc or the close button on When or Review goes back to the grid; Back steps back", () => {
    expect(run(atReview, { type: "close" }).stage).toBe("prices");
    expect(run(atReview, { type: "back" }).stage).toBe("when");
  });
  it("a start that passed while the review was open sends the admin back to When, not saving", () => {
    const s = run(atReview, { type: "saving", on: true }, { type: "stale" });
    expect(s).toMatchObject({ stage: "when", saving: false });
  });
  it("bulk with no prices to change says so rather than 'Changed 0 prices'", () => {
    const s = run(closedFlow, { type: "start", whens: defaultWhens(null, NOW) }, { type: "bulkText", text: "-10" }, {
      type: "bulkApply", cells: [{ key: "a", amount: null }], otherCharges: [], hasOtherCharges: false,
    });
    expect(s.bulkMessage).toEqual({ tone: "error", text: "No prices to change yet. Type a price into each cell first." });
  });
});
