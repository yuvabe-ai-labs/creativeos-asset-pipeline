import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import { scoreDraft, scoreEditIsolation, type ProbeOptions } from "../probe-score";
import { SCRIPT_FORMATS } from "../formats";

const r01 = scriptDocSchema.parse(reel01);
const UGC = SCRIPT_FORMATS.find((f) => f.name === "UGC")!.beats.map((b) => b.label);
// Reel 01 is Jackfruit's own script, so its words are the client's own, not a leak.
const jackfruit: ProbeOptions = { beats: UGC, clientText: JSON.stringify(reel01), neverList: ["cure", "diabetic-friendly"], shots: [12, 15], seconds: [45, 55] };
const failed = (doc: ScriptDoc, o: ProbeOptions) => scoreDraft(doc, o).filter((c) => !c.pass).map((c) => c.name);
const check = (doc: ScriptDoc, o: ProbeOptions, name: string) => scoreDraft(doc, o).find((c) => c.name === name)!;

/** A short reel of four beats, one shot each, cut from Reel 01. */
const four: ScriptDoc = {
  ...r01,
  shots: ["HOOK", "INTRO", "PROOF", "OUTRO"].map((beat) => r01.shots.find((s) => s.beat === beat)!),
};
const short: ProbeOptions = { ...jackfruit, beats: ["HOOK", "INTRO", "PROOF", "OUTRO"], shots: [4, 4], seconds: [0, 60] };

describe("scoreDraft", () => {
  it("passes the seeded Reel 01 against the UGC beats and its own client's words", () => {
    expect(failed(r01, jackfruit)).toEqual([]);
  });

  it("scores structure against the confirmed card's beats, not a fixed format", () => {
    expect(check(four, short, "structure").pass).toBe(true);
    expect(check(four, { ...short, beats: UGC }, "structure").pass).toBe(false);
  });

  it("asks for a review placeholder only when the beats include a review", () => {
    expect(check(four, short, "review placeholder").pass).toBe(true);
    const invented = { ...r01, shots: r01.shots.map((s) => (s.beat === "REVIEW" ? { ...s, vo: 'One customer wrote: "Loved it!"' } : s)) };
    expect(check(invented, jackfruit, "review placeholder").pass).toBe(false);
  });

  it("catches another client's words, but not the client's own", () => {
    // Reel 01's own words (spoon, flour, Golu) are Jackfruit's; CHUPPS is another client's.
    const leaked = { ...four, shots: four.shots.map((s, i) => (i === 0 ? { ...s, visual: "She walks out in the black CHUPPS V-Straps." } : s)) };
    expect(check(four, short, "no other client").pass).toBe(true);
    expect(check(leaked, short, "no other client").detail).toBe("found: chupps, v-straps");
    expect(check(leaked, { ...short, clientText: `${short.clientText} CHUPPS V-Straps` }, "no other client").pass).toBe(true);
  });

  it("still catches a never-list word and a timecode", () => {
    const bad = { ...r01, shots: r01.shots.map((s) => (s.id === "s01" ? { ...s, visual: "0-3s: a cure at the steps." } : s)) };
    expect(failed(bad, jackfruit)).toEqual(expect.arrayContaining(["never-list", "no timecodes"]));
  });
});

describe("scoreEditIsolation", () => {
  it("passes when only shots of the asked-for beat changed", () => {
    const after = { ...r01, shots: r01.shots.map((s) => (s.beat === "PAYOFF" ? { ...s, vo: "Warmer." } : s)) };
    expect(scoreEditIsolation(r01, after, "PAYOFF").pass).toBe(true);
  });

  it("fails when anything else changed", () => {
    const after = { ...r01, header: { ...r01.header, title: "Changed" } };
    expect(scoreEditIsolation(r01, after, "PAYOFF").pass).toBe(false);
  });
});
