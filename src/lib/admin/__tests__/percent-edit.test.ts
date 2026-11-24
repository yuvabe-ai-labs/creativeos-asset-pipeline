import { describe, expect, it } from "vitest";
import {
  applyPercent,
  bulkApplyPercent,
  isBigChange,
  parsePercent,
  parsePriceEntry,
  percentChange,
  percentChipText,
} from "../percent-edit";

describe("parsePercent", () => {
  it.each([
    ["−31%", -31],
    ["-31", -31],
    ["–31 %", -31],
    ["+20", 20],
    ["20%", 20],
    ["5.5", 5.5],
  ])("reads %j", (typed, pct) => {
    expect(parsePercent(typed)).toBe(pct);
  });
  it.each(["", "abc", "%", "1-2"])("refuses %j", (typed) => {
    expect(parsePercent(typed)).toBeNull();
  });
});

describe("applyPercent", () => {
  it("rounds to 4 significant figures and marks the result approximate", () => {
    expect(applyPercent(0.10136, -31)).toEqual({ value: 0.06994, approximate: true });
    expect(applyPercent(11.7, 10)).toEqual({ value: 12.87, approximate: true });
    expect(applyPercent(0.0337925, -31).value).toBe(0.02332);
  });
});

describe("parsePriceEntry", () => {
  it("reads a typed price exactly", () => {
    expect(parsePriceEntry("0.07", 0.1)).toEqual({ kind: "price", value: 0.07, approximate: false });
    expect(parsePriceEntry(" $1,000.5 ", null)).toEqual({ kind: "price", value: 1000.5, approximate: false });
    expect(parsePriceEntry(".5", null)).toEqual({ kind: "price", value: 0.5, approximate: false });
  });
  it("reads a percent against the old price", () => {
    expect(parsePriceEntry("−31%", 0.1)).toEqual({ kind: "price", value: 0.069, approximate: true });
    expect(parsePriceEntry("+10 %", 11.7)).toEqual({ kind: "price", value: 12.87, approximate: true });
  });
  it("refuses a percent with no old price, and anything that is not a price", () => {
    expect(parsePriceEntry("-31%", null)).toEqual({ kind: "invalid" });
    expect(parsePriceEntry("abc", 0.1)).toEqual({ kind: "invalid" });
    expect(parsePriceEntry("-0.5", 0.1)).toEqual({ kind: "invalid" });
    expect(parsePriceEntry("1.2.3", 0.1)).toEqual({ kind: "invalid" });
  });
  it("reads blank as empty", () => {
    expect(parsePriceEntry("  ", 0.1)).toEqual({ kind: "empty" });
  });
});

describe("bulkApplyPercent", () => {
  const cells = [
    { key: "a", amount: 0.1 },
    { key: "b", amount: 0.2 },
    { key: "n", amount: null },
  ];
  const otherCharges = [
    { key: "t", amount: 1.5, atCost: false },
    { key: "u", amount: 1, atCost: true },
  ];

  it("changes every priced cell and other charge, leaving hand-typed cells and at-cost lines alone", () => {
    const r = bulkApplyPercent({ cells, otherCharges, values: { b: "0.25" }, percentKeys: [], percent: -10, includeOtherCharges: true });
    expect(r.values).toEqual({ a: "0.09", b: "0.25", t: "1.35" });
    expect(r.percentKeys).toEqual(["a", "t"]);
    expect(r.changed).toBe(2);
    expect(r.kept).toBe(1);
  });

  it("leaves other charges out when asked", () => {
    const r = bulkApplyPercent({ cells, otherCharges, values: {}, percentKeys: [], percent: 20, includeOtherCharges: false });
    expect(r.values).toEqual({ a: "0.12", b: "0.24" });
    expect(r.changed).toBe(2);
  });

  it("re-applies over cells an earlier percent set, from the base price", () => {
    const first = bulkApplyPercent({ cells, otherCharges: [], values: {}, percentKeys: [], percent: -10, includeOtherCharges: true });
    const second = bulkApplyPercent({ cells, otherCharges: [], ...first, percent: -20, includeOtherCharges: true });
    expect(second.values).toEqual({ a: "0.08", b: "0.16" });
    expect(second.kept).toBe(0);
  });

  it("does not change the inputs", () => {
    const values = { b: "0.25" };
    const percentKeys: string[] = [];
    bulkApplyPercent({ cells, otherCharges, values, percentKeys, percent: -10, includeOtherCharges: true });
    expect(values).toEqual({ b: "0.25" });
    expect(percentKeys).toEqual([]);
  });
});

describe("big changes and the change chip", () => {
  it("percentChange is null without an old price", () => {
    expect(percentChange(0, 1)).toBeNull();
    expect(percentChange(null, 1)).toBeNull();
    expect(percentChange(0.1, 0.069)).toBeCloseTo(-31, 9);
  });
  it("a change of 50% or more is big", () => {
    expect(isBigChange(0.1, 0.05)).toBe(true);
    expect(isBigChange(0.1, 0.15)).toBe(true);
    expect(isBigChange(0.1, 0.0501)).toBe(false);
    expect(isBigChange(null, 5)).toBe(false);
  });
  it("chip text rounds like the prototype", () => {
    expect(percentChipText(-31.04)).toBe("−31%");
    expect(percentChipText(4.56)).toBe("+4.6%");
    expect(percentChipText(0.01)).toBeNull();
    expect(percentChipText(null)).toBeNull();
  });
});
