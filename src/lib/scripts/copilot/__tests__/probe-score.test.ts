import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import { scoreDraft, scoreEditIsolation, type ProbeOptions } from "../probe-score";

const r01 = scriptDocSchema.parse(reel01);
const r06 = scriptDocSchema.parse(reel06);
const ugc: ProbeOptions = {
  founderLed: false,
  lockedLines: ["Helps control blood sugar levels*", "Just 1 tablespoon per meal", "No change to your diet", "Available on Amazon"],
  neverList: ["cure", "diabetic-friendly"],
  shots: [12, 15],
  seconds: [45, 55],
};
const founder: ProbeOptions = { ...ugc, founderLed: true, lockedLines: ["Helps control blood sugar levels*"], shots: [9, 15] };
const failed = (doc: ScriptDoc, o: ProbeOptions) => scoreDraft(doc, o).filter((c) => !c.pass).map((c) => c.name);

describe("scoreDraft", () => {
  it("passes the seeded Reel 01 as a UGC first draft", () => {
    expect(failed(r01, ugc)).toEqual([]);
  });

  it("passes the seeded Reel 06 as a Founder-led reel: fixed frame, five topic beats, no review, no payoff", () => {
    expect(failed(r06, founder)).toEqual([]);
  });

  it("catches an invented review, a never-list word, a missing locked line and a timecode", () => {
    const bad: ScriptDoc = {
      ...r01,
      shots: r01.shots.map((s) => {
        if (s.beat === "REVIEW") return { ...s, vo: 'One customer wrote: "Loved it, my sugar is a cure now!"' };
        if (s.beat === "OUTRO") return { ...s, vo: "Jackfruit365.", onScreenText: "Pack shot." };
        if (s.id === "s01") return { ...s, visual: "0-3s: Meenakshi at the steps." };
        return s;
      }),
    };
    expect(failed(bad, ugc)).toEqual(expect.arrayContaining(["review placeholder", "never-list", "locked lines", "no timecodes"]));
  });

  it("catches a Founder-led reel with a review or a payoff", () => {
    const bad = { ...r06, shots: r06.shots.map((s) => (s.beat === "FOR FAMILIES" ? { ...s, beat: "PAYOFF" } : s)) };
    expect(failed(bad, founder)).toContain("structure");
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
