import { describe, it, expect } from "vitest";
import { timeShots, totalSeconds, formatSeconds, formatRange, groupByBeat } from "../timeline";
import { reelLabel, headerLine, shotSummary } from "../utils";
import { scriptDocSchema, type Shot } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const shot = (id: string, beat: string, lengthSeconds: number): Shot => ({
  id, beat, lengthSeconds, visual: "", vo: "", onScreenText: "", onScreen: [],
});

describe("timeline", () => {
  it("works out timecodes from lengths, including half seconds", () => {
    const timed = timeShots([shot("a", "BODY", 2.5), shot("b", "BODY", 2.5), shot("c", "PAYOFF", 3.5)]);
    expect(timed.map((t) => [t.start, t.end])).toEqual([[0, 2.5], [2.5, 5], [5, 8.5]]);
  });

  it("Reel 01 runs 52 seconds", () => {
    expect(totalSeconds(doc.shots)).toBe(52);
  });

  it("formats seconds and ranges the way the outlines write them", () => {
    expect(formatSeconds(3)).toBe("3");
    expect(formatSeconds(35.5)).toBe("35.5");
    expect(formatRange(33, 35.5)).toBe("33-35.5s");
  });

  it("groups back-to-back shots that share a beat", () => {
    const groups = groupByBeat(timeShots(doc.shots));
    expect(groups.map((g) => g.beat)).toEqual([
      "HOOK", "INTRO", "STORY", "STEP", "REVIEW", "BODY", "PAYOFF", "PROOF", "OUTRO",
    ]);
    expect(groups[0]).toMatchObject({ start: 0, end: 5 });
  });

  it("a beat that comes back later starts its own group (timeline order wins)", () => {
    const groups = groupByBeat(timeShots([shot("a", "HOOK", 2), shot("b", "STEP", 2), shot("c", "hook ", 2)]));
    expect(groups.map((g) => g.beat)).toEqual(["HOOK", "STEP", "HOOK"]);
  });

  it("each Reel 01 beat's voiceover is the outline's row, word for word", () => {
    const vo = groupByBeat(timeShots(doc.shots)).map((g) => g.shots.map((t) => t.shot.vo).join(" "));
    expect(vo).toEqual([
      "Golu starts today. Nine nights of guests, and the kitchen doesn't close.",
      "Festival week is busy, but that's no reason to let health slide. So breakfast stays simple: dosa and sambar.",
      "This is where Jackfruit365 comes in. I put it in the batter, so one stir covers the whole breakfast.",
      "One level tablespoon of the flour for each person. Two of us at breakfast, so two spoons.",
      'One customer wrote on Amazon: "[real review, verbatim]".',
      "Then it's dosas, sambar and chutney, same as always. No change to our diet.",
      "Breakfast is done. Jackfruit365 helps control blood sugar levels, and that's how we're starting Golu. Now, let the guests come.",
      "It's clinically tested green jackfruit flour.",
      "Jackfruit365 Green Jackfruit Flour. Available on Amazon.",
    ]);
  });
});

describe("display helpers", () => {
  it("labels reels with two digits, and none without a number", () => {
    expect(reelLabel(1)).toBe("Reel 01");
    expect(reelLabel(12)).toBe("Reel 12");
    expect(reelLabel(null)).toBeNull();
  });

  it("joins the header's non-empty parts", () => {
    expect(headerLine(doc.header)).toBe("UGC · South · Sun 11 Oct (first day of Navratri)");
    expect(headerLine({ ...doc.header, region: "" })).toBe("UGC · Sun 11 Oct (first day of Navratri)");
  });

  it("summarises shots and length", () => {
    expect(shotSummary(doc)).toBe("14 shots · 52s");
  });
});
