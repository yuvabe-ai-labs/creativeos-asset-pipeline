import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { normalizeForMatch, stripFormatting, unmatchedShots } from "../import-check";

const base = scriptDocSchema.parse(reel01);
const withShots = (shots: { vo: string; onScreenText: string }[]): ScriptDoc => ({
  ...base,
  shots: shots.map((s, i) => ({ ...base.shots[0], id: `s0${i + 1}`, ...s })),
});

describe("stripFormatting", () => {
  it("drops markdown escapes and bold markers, never words (Review Focus 1)", () => {
    expect(stripFormatting(String.raw`"\[real review, verbatim\]"`)).toBe('"[real review, verbatim]"');
    expect(stripFormatting(String.raw`**Helps control blood sugar levels\***`)).toBe("Helps control blood sugar levels*");
    expect(stripFormatting(String.raw`FSSAI Lic. No. \_\_\_\_ (licence`)).toBe("FSSAI Lic. No. ____ (licence");
    expect(stripFormatting("2021\\.")).toBe("2021.");
  });
});

describe("normalizeForMatch", () => {
  it("ignores spacing and quote style", () => {
    expect(normalizeForMatch("It’s  100%\ngreen")).toBe(normalizeForMatch("It's 100% green"));
    expect(normalizeForMatch("“hi”")).toBe('"hi"');
  });
  it("keeps case and wording", () => {
    expect(normalizeForMatch("Stir till")).not.toBe(normalizeForMatch("stir until"));
  });
});

describe("unmatchedShots", () => {
  it("passes Reel 07's lines as written, card lines joined and placeholder unescaped", () => {
    const doc = withShots([
      { vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes" },
      { vo: 'One customer wrote on Amazon: "[real review, verbatim]".', onScreenText: "Customer review on Amazon\nVerified Purchase" },
      { vo: "It’s 100% green jackfruit, nothing else. And it’s clinically tested.", onScreenText: "Helps control blood sugar levels* 100% green jackfruit. Nothing else." },
      { vo: "", onScreenText: "" },
    ]);
    expect(unmatchedShots(doc, REEL_07_PASTE)).toEqual([]);
  });

  it("names a shot whose VO or card the import changed (success 10)", () => {
    const doc = withShots([
      { vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes" },
      { vo: "Plain Greek yoghurt, some nuts, half an apple.", onScreenText: "Plain yogurt. Nuts. Apple." },
      { vo: "Bowl in the sink, bag on my shoulder, out by nine. Mostly.", onScreenText: "Out by 9." },
    ]);
    expect(unmatchedShots(doc, REEL_07_PASTE)).toEqual([
      { shotId: "s02", index: 1, fields: ["vo"] },
      { shotId: "s03", index: 2, fields: ["onScreenText"] },
    ]);
  });
});
