import { describe, it, expect } from "vitest";
import {
  mapEvalTraces,
  type EvalNodeRow,
  type EvalVersionRow,
} from "./map-traces";

const node = (over: Partial<EvalNodeRow> = {}): EvalNodeRow => ({
  id: "n1",
  data: { evalKey: "s1-shot0" },
  active_version_id: "v1",
  ...over,
});

const version = (over: Partial<EvalVersionRow> = {}): EvalVersionRow => ({
  id: "v1",
  inputs_used: { scriptNum: 1, scriptTitle: "Hero", reelType: "VISUAL", shotIndex: 0, shotText: "a shot" },
  generated_output: "the prompt",
  output: "edited prompt",
  decision: null,
  note: null,
  ...over,
});

describe("mapEvalTraces", () => {
  it("maps a node + its active version into a trace", () => {
    const [t] = mapEvalTraces([node()], [version()]);
    expect(t).toMatchObject({
      nodeId: "n1",
      versionId: "v1",
      evalKey: "s1-shot0",
      scriptNum: 1,
      scriptTitle: "Hero",
      reelType: "VISUAL",
      shotIndex: 0,
      shotText: "a shot",
      prompt: "the prompt",
      decision: null,
      note: null,
    });
  });

  it("skips a node with no active version pointer", () => {
    expect(mapEvalTraces([node({ active_version_id: null })], [version()])).toHaveLength(0);
  });

  it("skips a node whose active version row is missing", () => {
    expect(mapEvalTraces([node({ active_version_id: "ghost" })], [version()])).toHaveLength(0);
  });

  it("prefers generated_output, falls back to output, then empty string", () => {
    const map = (gen: unknown, out: unknown) =>
      mapEvalTraces([node()], [version({ generated_output: gen, output: out })])[0].prompt;
    expect(map("frozen", "edited")).toBe("frozen"); // generated_output wins
    expect(map(null, "edited")).toBe("edited"); // fall back to output
    expect(map(null, null)).toBe(""); // neither → ""
    expect(map({ not: "a string" }, null)).toBe(""); // non-string generated_output ignored
  });

  it("normalizes decision to pass | fail | null", () => {
    const dec = (d: unknown) =>
      mapEvalTraces([node()], [version({ decision: d })])[0].decision;
    expect(dec("pass")).toBe("pass");
    expect(dec("fail")).toBe("fail");
    expect(dec("approved")).toBeNull(); // unknown value → null
    expect(dec(undefined)).toBeNull();
  });

  it("keeps a string note, nulls a non-string note", () => {
    expect(mapEvalTraces([node()], [version({ note: "uses 8K" })])[0].note).toBe("uses 8K");
    expect(mapEvalTraces([node()], [version({ note: 42 })])[0].note).toBeNull();
  });

  it("coerces numeric fields and defaults missing ones to 0", () => {
    const [t] = mapEvalTraces(
      [node()],
      [version({ inputs_used: { scriptNum: "7", shotIndex: undefined } })],
    );
    expect(t.scriptNum).toBe(7); // string coerced
    expect(t.shotIndex).toBe(0); // missing → 0
    expect(t.scriptTitle).toBe(""); // missing string → ""
  });

  it("sorts by scriptNum, then shotIndex", () => {
    const mk = (id: string, scriptNum: number, shotIndex: number) => ({
      n: { id, data: {}, active_version_id: id } as EvalNodeRow,
      v: {
        id,
        inputs_used: { scriptNum, shotIndex },
        generated_output: "p",
        output: null,
        decision: null,
        note: null,
      } as EvalVersionRow,
    });
    const rows = [mk("a", 3, 0), mk("b", 1, 2), mk("c", 1, 0)];
    const order = mapEvalTraces(rows.map((r) => r.n), rows.map((r) => r.v)).map((t) => t.nodeId);
    expect(order).toEqual(["c", "b", "a"]); // (1,0) (1,2) (3,0)
  });
});
