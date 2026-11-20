import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(), revalidatePath: vi.fn(),
  saveBillingSettings: vi.fn(), saveProduct: vi.fn(), addPrice: vi.fn(), setPriceActive: vi.fn(),
}));
vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/db/billing-catalog", () => ({
  saveBillingSettings: m.saveBillingSettings, saveProduct: m.saveProduct, addPrice: m.addPrice, setPriceActive: m.setPriceActive,
}));

import { saveBillingSettingsAction, saveProductAction, addPriceAction, setPriceActiveAction } from "./billing-catalog";

const P = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const OLD = "5a6b7c8d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.requireSuperAdmin.mockResolvedValue({ userId: "admin-1", platformRole: "super_admin" });
});

describe("Plans and prices actions", () => {
  it("are for super admins only", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setPriceActiveAction(OLD, false)).rejects.toThrow("NOT_FOUND");
    await expect(saveProductAction({ id: null, kind: "plan", name: "Studio", description: "" })).rejects.toThrow("NOT_FOUND");
    expect(m.setPriceActive).not.toHaveBeenCalled();
  });

  it("saves settings as a new row and refreshes the page", async () => {
    await expect(saveBillingSettingsAction({ inrPerUsd: "100", planMarginPct: "20", topupMarginPct: "25", minMarginPct: "15", note: "Start" })).resolves.toEqual({});
    expect(m.saveBillingSettings).toHaveBeenCalledWith({ inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, note: "Start" }, "admin-1");
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/plans");
  });

  it("replaces a price and says how many agencies move", async () => {
    m.addPrice.mockResolvedValue({ priceId: "n", moved: 3 });
    await expect(addPriceAction({ productId: P, kind: "plan", amount: "12,000", credits: "100000", intervalMonths: 1, replaces: OLD, reason: "Cost went up" }))
      .resolves.toEqual({ moved: 3 });
    expect(m.addPrice).toHaveBeenCalledWith({ productId: P, amountMinor: 1_200_000, credits: 100_000, intervalMonths: 1, replaces: OLD, reason: "Cost went up" }, "admin-1");
  });

  it("refuses bad input before writing", async () => {
    await expect(addPriceAction({ productId: "nope", kind: "plan", amount: "1", credits: "1", intervalMonths: 1, replaces: null, reason: "" })).resolves.toEqual({ error: "Price not found." });
    await expect(addPriceAction({ productId: P, kind: "plan", amount: "abc", credits: "1", intervalMonths: 1, replaces: null, reason: "" })).resolves.toEqual({ error: "Enter the price in rupees, for example 10,100." });
    expect(m.addPrice).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("says plainly when a plan is missing", async () => {
    m.saveProduct.mockResolvedValue(null);
    await expect(saveProductAction({ id: P, kind: "plan", name: "Studio", description: "" })).resolves.toEqual({ error: "Plan not found." });
  });

  it("hides database errors behind plain words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.setPriceActive.mockRejectedValue(new Error("connection reset"));
    await expect(setPriceActiveAction(OLD, false)).resolves.toEqual({ error: "Could not save the change. Try again." });
  });
});
