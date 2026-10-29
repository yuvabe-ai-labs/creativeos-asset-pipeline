import { describe, expect, it } from "vitest";
import { usdToFinalCredits } from "@/lib/credits/units";
import { STT_USD_PER_HOUR, transcribeCredits } from "../cost";

describe("transcribeCredits", () => {
  it("is one conversion for the button and the reservation", () => {
    expect(transcribeCredits(37)).toBe(usdToFinalCredits((37 / 3600) * STT_USD_PER_HOUR));
    expect(transcribeCredits(0)).toBe(0);
  });
});
