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
  it("attaches each cut's instruction to its own shot", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: { c2: "hold on the handle" },
    });
    const c2Block = turn.slice(turn.indexOf("c2"));
    expect(c2Block).toContain("hold on the handle");
    expect(turn.slice(turn.indexOf("c1"), turn.indexOf("c2"))).not.toContain("hold on the handle");
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
