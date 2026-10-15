import { describe, it, expect } from "vitest";
import { computeDubCost, computeLipSyncCost, dubCredits, lipSyncCredits, SARVAM_DUB_INR_PER_MIN, LIP_SYNC_PRO_USD_PER_MIN } from "../cost";
import { USD_TO_INR } from "@/lib/pricing";
import { usdToFinalCredits } from "@/lib/credits/units";

describe("dubbing cost", () => {
  it("bills the dub per whole second of source, in rupees converted to dollars", () => {
    expect(computeDubCost(8.2).usd).toBeCloseTo((9 / 60) * SARVAM_DUB_INR_PER_MIN / USD_TO_INR, 10);
  });
  it("bills lip sync per second of video", () => {
    expect(computeLipSyncCost(12).usd).toBeCloseTo((12 / 60) * LIP_SYNC_PRO_USD_PER_MIN, 10);
  });
  it("turns both into final credits the same way the reservation does", () => {
    expect(dubCredits(8)).toBe(usdToFinalCredits(computeDubCost(8).usd));
    expect(lipSyncCredits(8)).toBe(usdToFinalCredits(computeLipSyncCost(8).usd));
  });
});
