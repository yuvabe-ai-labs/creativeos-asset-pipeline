import { describe, it, expect } from "vitest";
import { RupeesField, SettingsFormSchema, ProductFormSchema, PriceFormSchema } from "../catalog-schema";

const first = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("Plans and prices forms", () => {
  it("reads rupees with commas, a sign or paise, into paise", () => {
    expect(RupeesField.parse("10,100")).toBe(1_010_000);
    expect(RupeesField.parse("₹1,08,000")).toBe(10_800_000);
    expect(RupeesField.parse("99.50")).toBe(9_950);
  });

  it.each(["", "0", "abc", "10.123", "-5"])("refuses %j rupees", (v) => {
    expect(first(RupeesField.safeParse(v))).toBe("Enter the price in rupees, for example 10,100.");
  });

  it("reads the pricing settings", () => {
    expect(SettingsFormSchema.parse({ inrPerUsd: "100", planMarginPct: "20%", topupMarginPct: "25", minMarginPct: "15", note: "Start" }))
      .toEqual({ inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, note: "Start" });
    expect(first(SettingsFormSchema.safeParse({ inrPerUsd: "0", planMarginPct: "1", topupMarginPct: "1", minMarginPct: "1", note: "x" })))
      .toBe("Enter the rupees to a dollar, for example 100.");
    expect(first(SettingsFormSchema.safeParse({ inrPerUsd: "100", planMarginPct: "1", topupMarginPct: "1", minMarginPct: "1", note: "" })))
      .toBe("Add a reason.");
  });

  it("reads a plan's name, with an empty description as none", () => {
    expect(ProductFormSchema.parse({ kind: "plan", name: " Studio ", description: "" })).toEqual({ kind: "plan", name: "Studio", description: null });
    expect(first(ProductFormSchema.safeParse({ kind: "plan", name: "S", description: "" }))).toBe("Enter a name.");
  });

  const price = { kind: "plan" as const, amount: "12,000", credits: "100,000", intervalMonths: 1, reason: "", replacing: false };

  it("reads a monthly price", () => {
    expect(PriceFormSchema.parse(price)).toMatchObject({ amount: 1_200_000, credits: 100_000, intervalMonths: 1 });
  });

  it("offers only the intervals phase 1 supports", () => {
    expect(first(PriceFormSchema.safeParse({ ...price, intervalMonths: 12 }))).toBe("Pick how often the plan is paid.");
  });

  it("pays a top-up once", () => {
    expect(PriceFormSchema.safeParse({ ...price, kind: "topup", intervalMonths: null }).success).toBe(true);
    expect(first(PriceFormSchema.safeParse({ ...price, kind: "topup" }))).toBe("A top-up pack is paid once.");
  });

  it("needs a reason to replace a price", () => {
    expect(first(PriceFormSchema.safeParse({ ...price, replacing: true }))).toBe("Add a reason.");
  });
});
