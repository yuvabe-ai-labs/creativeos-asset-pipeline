import { describe, it, expect } from "vitest";
import { costMinor, periodCredits, realMarginPct, suggestAmountMinor, intervalLabel, creditsCadenceLabel, formatRupees } from "../pricing";

describe("pricing math (1,000 credits = $1)", () => {
  it("costs credits at the rate", () => {
    expect(costMinor(100_000, 100)).toBe(1_000_000); // Rs 10,000
    expect(costMinor(25_000, 100)).toBe(250_000);
  });

  it("counts every credit drop in a plan period", () => {
    expect(periodCredits({ credits: 100_000, interval_months: 1, credits_every_months: 1 })).toBe(100_000);
    expect(periodCredits({ credits: 100_000, interval_months: 12, credits_every_months: 1 })).toBe(1_200_000);
    expect(periodCredits({ credits: 300_000, interval_months: 3, credits_every_months: 3 })).toBe(300_000);
    expect(periodCredits({ credits: 25_000, interval_months: null, credits_every_months: null })).toBe(25_000);
  });

  it("works out the real margin of a price", () => {
    const price = { amount_minor: 1_200_000, credits: 100_000, interval_months: 1, credits_every_months: 1 };
    expect(realMarginPct(price, 100)).toBe(20);
    expect(realMarginPct({ ...price, amount_minor: 1_010_000 }, 100)).toBe(1);
    expect(realMarginPct({ ...price, amount_minor: 900_000 }, 100)).toBe(-10);
  });

  it("suggests a price at a margin, rounded up to a whole rupee", () => {
    expect(suggestAmountMinor(100_000, 100, 20)).toBe(1_200_000);
    expect(suggestAmountMinor(33_333, 100, 20)).toBe(400_000); // Rs 3,999.96 rounds up to Rs 4,000
  });

  it("names intervals and how often credits arrive", () => {
    expect(intervalLabel(1)).toBe("Monthly");
    expect(intervalLabel(3)).toBe("Quarterly");
    expect(intervalLabel(6)).toBe("Half-yearly");
    expect(intervalLabel(12)).toBe("Yearly");
    expect(intervalLabel(2)).toBe("Every 2 months");
    expect(creditsCadenceLabel(12, 1)).toBe("every month");
    expect(creditsCadenceLabel(1, 1)).toBe("every month");
    expect(creditsCadenceLabel(12, 12)).toBe("all at once");
  });

  it("writes rupees the Indian way", () => {
    expect(formatRupees(1_010_000)).toBe("₹10,100");
    expect(formatRupees(10_800_000)).toBe("₹1,08,000");
  });
});
