import { describe, it, expect } from "vitest";
import {
  renderMultishotComposeContext,
  retimeSequence,
  sequenceSeconds,
  shotsTotalSeconds,
  clampToOmniBudget,
} from "../shot-compose";
import { getSequenceRole } from "../sequence-roles";

const role = getSequenceRole("");
const seq = (...pairs: Array<[string, number]>) => ({
  title: "t",
  beats: pairs.map(([description, seconds]) => ({ description, seconds })),
});

describe("clampToOmniBudget", () => {
  it("holds the 3-10s range", () => {
    expect(clampToOmniBudget(1)).toBe(3);
    expect(clampToOmniBudget(7)).toBe(7);
    expect(clampToOmniBudget(40)).toBe(10);
  });

  it("falls back to the ceiling for an unusable value", () => {
    expect(clampToOmniBudget(NaN)).toBe(10);
    expect(clampToOmniBudget(0)).toBe(10);
  });
});

describe("shotsTotalSeconds", () => {
  it("sums each beat, assuming 4s for one with no usable length", () => {
    expect(shotsTotalSeconds([{ description: "a", duration_seconds: 3 }, { description: "b" }])).toBe(7);
  });
});

describe("retimeSequence", () => {
  // The bug this replaces: a composer that correctly split a 2-line act into 5 real beats was
  // REFUSED, leaving every direction unusable. The beat count is the composer's call.
  it("accepts a beat count unrelated to the shot's own", () => {
    const out = retimeSequence(seq(["a", 1], ["b", 1], ["c", 1], ["d", 1], ["e", 1]), 10);
    expect(out).toHaveLength(5);
  });

  it("always sums to exactly the budget", () => {
    for (const budget of [3, 5, 7, 8, 10]) {
      const out = retimeSequence(seq(["a", 2], ["b", 5], ["c", 1], ["d", 3]), budget);
      expect(out.reduce((s, b) => s + b.seconds, 0)).toBe(budget);
    }
  });

  // A sequence written as three quick cuts and a hold must stay three quick cuts and a hold.
  it("preserves the rhythm when scaling", () => {
    const out = retimeSequence(seq(["a", 1], ["b", 1], ["c", 1], ["d", 5]), 8);
    expect(out.map((b) => b.seconds)).toEqual([1, 1, 1, 5]);
    // And the hold is still the longest beat after a scale-down.
    const smaller = retimeSequence(seq(["a", 2], ["b", 2], ["c", 8]), 6);
    expect(smaller[2].seconds).toBeGreaterThan(smaller[0].seconds);
  });

  it("never emits a beat under one second", () => {
    const out = retimeSequence(seq(["a", 1], ["b", 1], ["c", 1], ["d", 1], ["e", 20]), 6);
    expect(out.every((b) => b.seconds >= 1)).toBe(true);
  });

  // A 12-beat sequence in 5 seconds is not a shorter film, it is a broken one.
  it("drops the tail rather than shrinking beats below the floor", () => {
    const out = retimeSequence(seq(...Array.from({ length: 12 }, (_, i) => [`b${i}`, 1] as [string, number])), 5);
    expect(out).toHaveLength(5);
    expect(out.reduce((s, b) => s + b.seconds, 0)).toBe(5);
  });

  it("drops empty beats", () => {
    expect(retimeSequence(seq(["a", 2], ["   ", 2], ["c", 2]), 6).map((b) => b.description))
      .toEqual(["a", "c"]);
  });

  it("returns nothing for an empty sequence", () => {
    expect(retimeSequence({ title: "t", beats: [] }, 8)).toEqual([]);
  });

  it("treats a missing or junk seconds value as one second", () => {
    const out = retimeSequence(
      { title: "t", beats: [{ description: "a" }, { description: "b", seconds: 3 }] } as never,
      8,
    );
    expect(out.reduce((s, b) => s + b.seconds, 0)).toBe(8);
    expect(out[1].seconds).toBeGreaterThan(out[0].seconds);
  });

  it("trims whitespace off descriptions", () => {
    expect(retimeSequence(seq(["  a  ", 3]), 3)[0].description).toBe("a");
  });
});

describe("sequenceSeconds", () => {
  it("sums the model's own proposed lengths", () => {
    expect(sequenceSeconds(seq(["a", 2], ["b", 3]))).toBe(5);
  });
});

describe("renderMultishotComposeContext", () => {
  const shots = [
    { description: "hands lift the jar", duration_seconds: 4 },
    { description: "macro on the lid", duration_seconds: 3 },
  ];
  const ctx = (over?: Partial<Parameters<typeof renderMultishotComposeContext>[0]>) =>
    renderMultishotComposeContext({ shots, role, clientContext: "", budgetSeconds: 8, ...over });

  // Presenting the current content as a fixed ladder taught the composer to return one beat per
  // parsed line — which is how a two-line act came back as a two-beat film.
  it("presents current content as lines to split, not timings to keep", () => {
    const out = ctx();
    expect(out).toContain("split any line that holds several cuts");
    expect(out).not.toContain("keep these timings");
  });

  it("states the duration budget and the resulting beat ceiling", () => {
    const out = ctx();
    expect(out).toContain("TOTAL DURATION BUDGET: 8s");
    expect(out).toContain("sum to exactly 8");
    expect(out).toContain("at most 8 beats");
  });

  it("lists each current line with its own length", () => {
    expect(ctx()).toContain("1. (4s) hands lift the jar");
  });

  // D203 — a SEQUENCE role. Its arc and its own cutting rule are the fields with no analogue in
  // the single-shot catalog, and they are what make the patterns differ from each other.
  it("includes the sequence role's arc, cut rule, slots and avoid-list", () => {
    const out = ctx();
    expect(out).toContain(`Sequence role: ${role.label}`);
    expect(out).toContain(role.arc);
    expect(out).toContain(role.cutRule);
    expect(out).toContain(role.slots[0]);
    expect(out).toContain(role.avoid[0]);
  });

  it("states the role's typical beat count", () => {
    expect(ctx()).toContain(`${role.beats[0]}-${role.beats[1]} beats`);
  });

  it("includes the objective and brand context only when present", () => {
    const withBoth = ctx({ clientContext: "Warm, grounded.", objective: "Sell the shoe" });
    expect(withBoth).toContain("Objective: Sell the shoe");
    expect(withBoth).toContain("Brand context:\nWarm, grounded.");

    const without = ctx({ clientContext: "  ", objective: "  " });
    expect(without).not.toContain("Objective:");
    expect(without).not.toContain("Brand context:");
  });

  it("names an empty line rather than emitting a blank row", () => {
    expect(ctx({ shots: [{ description: "" }, { description: "second" }] }))
      .toContain("(no description yet)");
  });
});
