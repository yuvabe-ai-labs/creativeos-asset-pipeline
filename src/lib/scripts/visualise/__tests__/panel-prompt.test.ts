import { describe, it, expect } from "vitest";
import { drawsAsGrid, mentionsGraphic, mentionsScreen, panelGridClause, shotMoments } from "../panel-prompt";

// D463 — Reel 32 (staging): a shot whose action has several moments is drawn as a 2 by 2 sheet.
// D470 — checked against every brand's scripts on staging, not one reel's: the shots below are theirs.
describe("a storyboard sheet for a shot with several moments", () => {
  const CAST = ["Anjali", "Hemant"];

  it("counts each action after its doer, and each one that continues the doer's sentence", () => {
    expect(shotMoments({ visual: "Evening at home. Anjali holds up the pack and asks a question. Hemant takes it from her and reads the label." }, CAST)).toBe(4);
    expect(shotMoments({ visual: "He flips the printed study page and points at the journal name." })).toBe(2);
  });

  it("does not count an article, a camera move or a thing as a doer", () => {
    expect(shotMoments({ visual: "Hemant smiles. The plates are the same as always." }, CAST)).toBe(1);
    expect(shotMoments({ visual: "Pan across the festive living room. Camera tilts down to the sandals." }, ["Shashi"])).toBe(0);
    expect(shotMoments({ visual: "Sliced onions sizzling in oil. Walking shots on the street. Different angles showing the design." })).toBe(0);
  });

  it("knows the script's own cast however the shot writes them", () => {
    expect(drawsAsGrid({ visual: "LEAD hands the box to the mother. Mother opens it." }, ["Lead", "Mother"])).toBe(true);
  });

  it("draws one frame for one person's one or two actions", () => {
    expect(drawsAsGrid({ visual: "Hemant and Anjali at the table. He gives her a quiet nod." }, CAST)).toBe(false);
    expect(drawsAsGrid({ visual: "Shobha lifts the lid of the batter bowl and smiles at camera." }, ["Shobha"])).toBe(false);
    expect(drawsAsGrid({ visual: "Rajan holds up the pack and reads the back label, nodding." }, ["Rajan"])).toBe(false);
    expect(drawsAsGrid({ visual: "Mother smiles as she opens a delivery box on the kitchen counter." }, ["Mother", "Son"])).toBe(false);
    expect(drawsAsGrid({ visual: "Pack on the table." })).toBe(false);
  });

  it("draws a sheet when the action passes between people or runs three or more steps", () => {
    expect(drawsAsGrid({ visual: "Anjali puts chapatis on the table. Hemant smiles." }, CAST)).toBe(true);
    expect(drawsAsGrid({ visual: "She applies her favourite shade, puts on her earrings, and admires her finished makeup." }, ["Lead"])).toBe(true);
  });

  it("asks for the frames in order, in the reel's aspect, with no numbers or arrows", () => {
    const clause = panelGridClause("9:16");
    expect(clause).toContain("4 frames of this one shot in a 2 by 2 grid, read left to right, top to bottom");
    expect(clause).toContain("Each frame is 9:16");
    expect(clause).toContain("No numbers, arrows or notes.");
  });
});

describe("what the edit lays over a shot (D470)", () => {
  it("finds a logo, a tagline, a card, on-screen text or a split screen", () => {
    for (const visual of [
      "Final full-length portrait of the Lead. The brand logo and tagline elegantly appear on screen.",
      "Hold on the claim card over the pack.",
      "Quick transitions showing her applying each shade, with the shade name appearing on screen.",
      "Split screen: she zips up the school bag on the left, a review on the right.",
      "orange end card with the logo.",
    ]) expect(mentionsGraphic({ visual })).toBe(true);
  });

  it("leaves a real card, a logo printed on the pack and a note that there is none", () => {
    for (const visual of [
      "He taps his debit card on the reader.",
      "She taps the claim line on the pack.",
      "She holds up the snack pack, tapping the front logo.",
      "Neha places a diya by the door, then turns to camera. No logo on screen.",
    ]) expect(mentionsGraphic({ visual })).toBe(false);
  });
});

describe("a screen in the shot (D470)", () => {
  it("finds a phone, laptop or app screen, but not 'on screen' as a place in the frame", () => {
    expect(mentionsScreen({ visual: "Close-up on Papa's phone screen. A notification chime sounds." })).toBe(true);
    expect(mentionsScreen({ visual: "A gift box on a bed, a phone beside it showing the website." })).toBe(true);
    expect(mentionsScreen({ visual: "LEAD is back on screen, checking off items on her fingers." })).toBe(false);
    expect(mentionsScreen({ visual: "Aarti hands a mug off-screen to a family member." })).toBe(false);
  });
});
