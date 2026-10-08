import { describe, it, expect } from "vitest";
import { scriptDocSchema } from "../schema";
import { groupByBeat, timeShots, totalSeconds } from "../timeline";
import { printScript } from "../print";
import reel01 from "../fixtures/reel-01.json";
import reel06 from "../fixtures/reel-06.json";
import reel08 from "../fixtures/reel-08.json";

// The three seeded reels, one per format structure the 28 outlines use (formats, slots and tools
// model §1): the copilot learns each structure from the library (spec 2 §4.3).

const beats = (doc: unknown) => groupByBeat(timeShots(scriptDocSchema.parse(doc).shots)).map((g) => g.beat);
const voByBeat = (doc: unknown) =>
  groupByBeat(timeShots(scriptDocSchema.parse(doc).shots)).map((g) => g.shots.map((t) => t.shot.vo).join(" "));

describe("seeded reels", () => {
  it.each([["01", reel01], ["06", reel06], ["08", reel08]])("Reel %s is valid, runs 52 s and every shot has VO and on-screen text", (_n, doc) => {
    const parsed = scriptDocSchema.parse(doc);
    expect(totalSeconds(parsed.shots)).toBe(52);
    expect(parsed.header.production).toBe("AI-generated");
    for (const s of parsed.shots) {
      expect(s.vo.trim()).not.toBe("");
      expect(s.onScreenText.trim()).not.toBe("");
    }
    expect(parsed.cast.filter((c) => c.isLead)).toHaveLength(1);
  });

  it("Reel 06 is Founder-led: fixed frame with free middle beats, no review, no payoff, James the only cast", () => {
    const doc = scriptDocSchema.parse(reel06);
    expect(doc.header.format).toBe("Founder-led");
    expect(beats(reel06)).toEqual(["HOOK", "INTRO", "WHAT IT IS", "STEP", "WHY NO CHANGE", "PROOF", "HONEST LINE", "FOR FAMILIES", "OUTRO"]);
    expect(doc.cast.map((c) => c.name)).toEqual(["James"]);
  });

  it("Reel 08 is UGC review first: the review comes straight after the hook", () => {
    const doc = scriptDocSchema.parse(reel08);
    expect(doc.header.format).toBe("UGC, review first");
    expect(beats(reel08)).toEqual(["HOOK", "REVIEW", "INTRO", "STORY", "STEP", "BODY", "PAYOFF", "PROOF", "OUTRO"]);
    expect(doc.cast.find((c) => c.isLead)?.name).toBe("Hemant");
  });

  it("Reel 06's voiceover is the outline's, word for word", () => {
    expect(voByBeat(reel06)).toEqual([
      "Today is World Diabetes Day. You don't have to give up the food your family eats.",
      "If someone at your table manages blood sugar, roti and rice don't have to go.",
      "So what is Jackfruit365? Green jackfruit flour, naturally high in soluble fibre.",
      "100% green jackfruit, nothing else. One tablespoon per meal.",
      "We say no change to your diet because families eat together, and nobody should have to cook two meals.",
      "It was tested in a randomised, double-blind, placebo-controlled study with 40 people with type 2 diabetes, published in Nature's Nutrition & Diabetes.",
      "It's one tablespoon of flour. Individual results may vary.",
      "Cooking for someone at your table? Share this reel with them.",
      "Jackfruit365 Green Jackfruit Flour. Available on Amazon.",
    ]);
  });

  it("Reel 08's voiceover is the outline's, word for word", () => {
    expect(voByBeat(reel08)).toEqual([
      "First thing I did was read the back of the pack.",
      'One customer wrote on Amazon: "[real review, verbatim]".',
      "Anjali asked, what is this? I said, let's read about it first.",
      "So I read about the study too. I like to know what's going into my family's food.",
      "After that it was easy. One tablespoon of the Jackfruit365 flour in the atta.",
      "Same chapatis, same thali. Nothing on the plate is different.",
      "Now it's just part of dinner. Nothing dramatic.",
      "Clinically tested. 100% green jackfruit, nothing else.",
      "Jackfruit365. Available on Amazon, where you can read the reviews.",
    ]);
  });

  it("prints Reel 06's header line the way the outline writes it, with no empty theme", () => {
    expect(printScript(scriptDocSchema.parse(reel06))).toContain(
      "| Founder-led | Pan-India   ·   Sat 14 Nov (World Diabetes Day)   ·   9:16, 45 to 55 sec   ·   AI-generated |",
    );
  });
});
