import { describe, it, expect } from "vitest";
import { drawsAsGrid, panelGridClause, shotMoments } from "../panel-prompt";

// D463 — Reel 32 (staging): a shot whose action has several moments is drawn as a 2 by 2 sheet.
describe("a storyboard sheet for a shot with several moments", () => {
  it("counts each action after its doer or an and", () => {
    expect(shotMoments({ visual: "Evening at home. Anjali holds up the pack and asks a question. Hemant takes it from her and reads the label." })).toBe(4);
    expect(shotMoments({ visual: "He flips the printed study page and points at the journal name." })).toBe(2);
  });

  it("does not count an article as a doer", () => {
    expect(shotMoments({ visual: "Hemant smiles. The plates are the same as always." })).toBe(1);
  });

  it("draws one frame for a single moment or none", () => {
    expect(drawsAsGrid({ visual: "Hemant and Anjali at the table. He gives her a quiet nod." })).toBe(false);
    expect(drawsAsGrid({ visual: "Top-down at home. One tablespoon of flour into the atta, hand mixes." })).toBe(false);
    expect(drawsAsGrid({ visual: "Pack on the table." })).toBe(false);
    expect(drawsAsGrid({ visual: "Anjali puts chapatis on the table. Hemant smiles." })).toBe(true);
  });

  it("asks for the frames in order, in the reel's aspect, with no numbers or arrows", () => {
    const clause = panelGridClause("9:16");
    expect(clause).toContain("4 frames of this one shot in a 2 by 2 grid, read left to right, top to bottom");
    expect(clause).toContain("Each frame is 9:16");
    expect(clause).toContain("No numbers, arrows or notes.");
  });
});
