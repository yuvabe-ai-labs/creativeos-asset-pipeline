import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(), revalidatePath: vi.fn(),
  saveBillingSettings: vi.fn(), saveProduct: vi.fn(), saveOffer: vi.fn(), getCurrentPrice: vi.fn(), trigger: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: m.trigger } }));
vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/db/billing-catalog", () => ({
  saveBillingSettings: m.saveBillingSettings, saveProduct: m.saveProduct, saveOffer: m.saveOffer, getCurrentPrice: m.getCurrentPrice,
}));

import { saveBillingSettingsAction, saveOfferAction, setOfferShownAction } from "./billing-catalog";

const P = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const offer = { productId: null, kind: "plan" as const, name: "Studio", description: "", active: true, amount: "12,000", credits: "1,00,000", reason: "" };

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.requireSuperAdmin.mockResolvedValue({ userId: "admin-1", platformRole: "super_admin" });
  m.saveOffer.mockResolvedValue({ productId: P, priceChanged: true, moved: 0 });
});

describe("Plans and prices actions", () => {
  it("are for super admins only", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(saveOfferAction(offer)).rejects.toThrow("NOT_FOUND");
    await expect(setOfferShownAction({ productId: P, kind: "plan", name: "S", description: null, shown: false })).rejects.toThrow("NOT_FOUND");
    expect(m.saveOffer).not.toHaveBeenCalled();
  });

  it("saves settings as a new row and refreshes the page", async () => {
    await expect(saveBillingSettingsAction({ inrPerUsd: "100", planMarginPct: "20", topupMarginPct: "25", minMarginPct: "15", note: "Start" })).resolves.toEqual({});
    expect(m.saveBillingSettings).toHaveBeenCalledWith({ inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, note: "Start" }, "admin-1");
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/plans");
  });

  it("adds a plan and its monthly price in one step, with no reason needed", async () => {
    await expect(saveOfferAction(offer)).resolves.toEqual({ moved: 0 });
    expect(m.saveOffer).toHaveBeenCalledWith(
      { productId: null, kind: "plan", name: "Studio", description: null, active: true, amountMinor: 1_200_000, credits: 100_000, intervalMonths: 1, reason: null },
      "admin-1",
    );
    expect(m.getCurrentPrice).not.toHaveBeenCalled();
  });

  it("adds a top-up pack paid once", async () => {
    await saveOfferAction({ ...offer, kind: "topup" });
    expect(m.saveOffer).toHaveBeenCalledWith(expect.objectContaining({ kind: "topup", intervalMonths: null }), "admin-1");
  });

  it("asks for a reason when an edit changes the price", async () => {
    m.getCurrentPrice.mockResolvedValue({ amountMinor: 1_010_000, credits: 100_000 });
    await expect(saveOfferAction({ ...offer, productId: P })).resolves.toEqual({ error: "Add a reason for the new price." });
    expect(m.saveOffer).not.toHaveBeenCalled();
  });

  it("edits name and description without a reason when the price stays", async () => {
    m.getCurrentPrice.mockResolvedValue({ amountMinor: 1_200_000, credits: 100_000 });
    m.saveOffer.mockResolvedValue({ productId: P, priceChanged: false, moved: 0 });
    await expect(saveOfferAction({ ...offer, productId: P, name: "Studio Plus" })).resolves.toEqual({ moved: 0 });
  });

  it("says how many agencies move to a new price, and moves them on Razorpay in the background (D593)", async () => {
    m.saveOffer.mockResolvedValue({ productId: P, priceChanged: true, moved: 3 });
    await expect(saveOfferAction({ ...offer, productId: P, reason: "Costs went up" })).resolves.toEqual({ moved: 3 });
    expect(m.trigger).toHaveBeenCalledWith("move-plan-price", { productId: P });
  });

  it("starts no moves when no one moves, and saves even when the background run can't start", async () => {
    await saveOfferAction(offer);
    expect(m.trigger).not.toHaveBeenCalled();
    m.saveOffer.mockResolvedValue({ productId: P, priceChanged: true, moved: 1 });
    m.trigger.mockRejectedValue(new Error("queue down"));
    await expect(saveOfferAction({ ...offer, productId: P, reason: "Costs went up" })).resolves.toEqual({ moved: 1 });
  });

  it("refuses bad input before writing", async () => {
    await expect(saveOfferAction({ ...offer, productId: "nope" })).resolves.toEqual({ error: "Plan not found." });
    await expect(saveOfferAction({ ...offer, amount: "abc" })).resolves.toEqual({ error: "Enter the price in rupees, for example 10,100." });
    await expect(saveOfferAction({ ...offer, name: "S" })).resolves.toEqual({ error: "Enter a name." });
    expect(m.saveOffer).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides and shows a plan", async () => {
    m.saveProduct.mockResolvedValue(P);
    await expect(setOfferShownAction({ productId: P, kind: "plan", name: "Studio", description: null, shown: false })).resolves.toEqual({});
    expect(m.saveProduct).toHaveBeenCalledWith({ id: P, kind: "plan", name: "Studio", description: null, active: false }, "admin-1");
  });

  it("hides database errors behind plain words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.saveOffer.mockRejectedValue(new Error("connection reset"));
    await expect(saveOfferAction(offer)).resolves.toEqual({ error: "Could not save the change. Try again." });
  });
});
