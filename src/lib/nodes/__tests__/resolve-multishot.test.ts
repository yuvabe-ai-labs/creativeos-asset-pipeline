import { describe, it, expect } from "vitest";
import { buildMultishotUserTurn } from "../resolve-inputs";
import type { MultishotCut } from "../multishot-cuts";

const cuts: MultishotCut[] = [
  { id: "c1", text: "close on keys", seconds: 2 },
  { id: "c2", text: "cab door", seconds: 3 },
];

describe("buildMultishotUserTurn", () => {
  it("lists every shot with its id, text and seconds", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(turn).toContain("c1");
    expect(turn).toContain("close on keys");
    expect(turn).toContain("2s");
    expect(turn).toContain("c2");
    expect(turn).toContain("cab door");
  });

  // A cut's own steer must sit WITH that cut, not in a separate list the writer has to align.
  // Three cuts, each with its OWN distinct steer, so we can prove each steer lands strictly
  // inside its own shot's block — bounded by that shot's header on one side and either the
  // NEXT shot's header or the end of the shots section on the other. A weaker check (e.g. "the
  // steer appears somewhere after this cut's id") would still pass against an implementation
  // that emits all shots first and appends the steers afterward as a parallel list — exactly
  // the regression this test exists to catch, since a trailing list still sits "after" every
  // shot's id.
  it("attaches each cut's instruction to its own shot, not a parallel trailing list", () => {
    const cuts3: MultishotCut[] = [
      { id: "c1", text: "close on keys", seconds: 2 },
      { id: "c2", text: "cab door", seconds: 3 },
      { id: "c3", text: "driving off", seconds: 4 },
    ];
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts: cuts3,
      instruction: "",
      cutInstructions: { c2: "hold on the handle", c3: "wide shot, no dialogue" },
    });

    // Each cut's block: from ITS OWN header to whichever comes first — the next shot's header,
    // or the end of the string (the last cut has no "next header" to bound it).
    const c1Start = turn.indexOf("cutId: c1");
    const c2Start = turn.indexOf("cutId: c2");
    const c3Start = turn.indexOf("cutId: c3");
    expect(c1Start).toBeGreaterThanOrEqual(0);
    expect(c2Start).toBeGreaterThan(c1Start);
    expect(c3Start).toBeGreaterThan(c2Start);

    const c1Block = turn.slice(c1Start, c2Start);
    const c2Block = turn.slice(c2Start, c3Start);
    const c3Block = turn.slice(c3Start);

    // Each steer lands inside its OWN block...
    expect(c2Block).toContain("hold on the handle");
    expect(c3Block).toContain("wide shot, no dialogue");

    // ...and nowhere else — in particular not in a later cut's block, which is where a
    // trailing parallel steers list would land instead.
    expect(c1Block).not.toContain("hold on the handle");
    expect(c1Block).not.toContain("wide shot, no dialogue");
    expect(c2Block).not.toContain("wide shot, no dialogue");
    expect(c3Block).not.toContain("hold on the handle");
  });

  it("includes the sequence-wide steer once", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "punchy and everyday",
      cutInstructions: {},
    });
    expect(turn.match(/punchy and everyday/g)).toHaveLength(1);
  });

  it("includes brand context when present and omits the heading when not", () => {
    const withCtx = buildMultishotUserTurn({
      clientContext: "CHUPPS makes sandals",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(withCtx).toContain("CHUPPS makes sandals");
    const without = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(without).not.toMatch(/Brand context/);
  });
});
