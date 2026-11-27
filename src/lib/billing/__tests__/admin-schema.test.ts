import { describe, it, expect, vi, afterEach } from "vitest";
import { GrantFormSchema, TakeBackSchema, GrantEndSchema, BillingModeSchema, FreeCreditsFormSchema } from "../admin-schema";

afterEach(() => vi.useRealTimers());
const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); };
const first = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("admin billing forms", () => {
  it("reads credits with or without commas", () => {
    at("2026-11-20T06:00:00Z");
    expect(GrantFormSchema.parse({ credits: "50,000", day: "2026-12-03", reason: "Trial" })).toEqual({ credits: 50000, day: "2026-12-03", reason: "Trial" });
  });

  it.each(["0", "-5", "12.5", "abc", ""])("refuses %j credits", (credits) => {
    at("2026-11-20T06:00:00Z");
    expect(first(GrantFormSchema.safeParse({ credits, day: "2026-12-03", reason: "x" }))).toBe("Enter the credits as a whole number above 0.");
  });

  it("refuses a day already gone, and allows today", () => {
    at("2026-11-20T06:00:00Z");
    expect(first(GrantFormSchema.safeParse({ credits: "10", day: "2026-11-19", reason: "x" }))).toBe("Pick today or a later day.");
    expect(GrantFormSchema.safeParse({ credits: "10", day: "2026-11-20", reason: "x" }).success).toBe(true);
  });

  it("needs a reason", () => {
    at("2026-11-20T06:00:00Z");
    expect(first(GrantFormSchema.safeParse({ credits: "10", day: "2026-12-03", reason: "  " }))).toBe("Add a reason.");
    expect(first(TakeBackSchema.safeParse({ credits: "10", reason: "" }))).toBe("Add a reason.");
    expect(first(BillingModeSchema.safeParse({ mode: "plans", reason: "" }))).toBe("Add a reason.");
  });

  it("ends now when no day is given", () => {
    expect(GrantEndSchema.parse({ day: null, reason: "Mistake" })).toEqual({ day: null, reason: "Mistake" });
  });

  it("reads the Add an agency free credits: none, or both fields", () => {
    at("2026-11-20T06:00:00Z");
    expect(FreeCreditsFormSchema.parse({ give: "", credits: "", day: "" })).toBeNull();
    expect(FreeCreditsFormSchema.parse({ give: "1", credits: "50000", day: "2026-12-03" })).toEqual({ credits: 50000, day: "2026-12-03" });
    expect(first(FreeCreditsFormSchema.safeParse({ give: "1", credits: "", day: "2026-12-03" }))).toBe("Enter the credits as a whole number above 0.");
    expect(first(FreeCreditsFormSchema.safeParse({ give: "1", credits: "5", day: "" }))).toBe("Pick when the free credits expire.");
  });
});
