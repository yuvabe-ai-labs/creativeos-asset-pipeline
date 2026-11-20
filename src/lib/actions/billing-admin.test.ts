import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(), revalidatePath: vi.fn(),
  setBillingMode: vi.fn(), grantCredits: vi.fn(), takeBackCredits: vi.fn(), setGrantEnd: vi.fn(),
}));
vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/db/billing-admin", () => ({
  setBillingMode: m.setBillingMode, grantCredits: m.grantCredits, takeBackCredits: m.takeBackCredits, setGrantEnd: m.setGrantEnd,
}));

import { setBillingModeAction, grantCreditsAction, takeBackCreditsAction, setGrantEndAction } from "./billing-admin";

const ORG = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const GRANT = "5a6b7c8d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.requireSuperAdmin.mockResolvedValue({ userId: "admin-1", platformRole: "super_admin" });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T06:00:00Z"));
});

describe("billing admin actions", () => {
  it("are for super admins only", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setBillingModeAction(ORG, "plans", "x")).rejects.toThrow("NOT_FOUND");
    await expect(grantCreditsAction(ORG, "free", "10", "2026-12-03", "x")).rejects.toThrow("NOT_FOUND");
    await expect(takeBackCreditsAction(ORG, GRANT, "10", "x")).rejects.toThrow("NOT_FOUND");
    await expect(setGrantEndAction(ORG, GRANT, null, "x")).rejects.toThrow("NOT_FOUND");
    expect(m.setBillingMode).not.toHaveBeenCalled();
  });

  it("changes billing and refreshes the agency page", async () => {
    m.setBillingMode.mockResolvedValue(true);
    await expect(setBillingModeAction(ORG, "plans", " Paying now ")).resolves.toEqual({});
    expect(m.setBillingMode).toHaveBeenCalledWith(ORG, "plans", "admin-1", "Paying now");
    expect(m.revalidatePath).toHaveBeenCalledWith(`/admin/orgs/${ORG}`);
  });

  it("refuses bad input before writing", async () => {
    await expect(setBillingModeAction("nope", "plans", "x")).resolves.toEqual({ error: "Agency not found." });
    await expect(grantCreditsAction(ORG, "free", "0", "2026-12-03", "x")).resolves.toEqual({ error: "Enter the credits as a whole number above 0." });
    await expect(grantCreditsAction(ORG, "plan" as never, "10", "2026-12-03", "x")).resolves.toEqual({ error: "Could not save the change. Try again." });
    expect(m.grantCredits).not.toHaveBeenCalled();
  });

  it("grants free or added credits", async () => {
    m.grantCredits.mockResolvedValue("g1");
    await expect(grantCreditsAction(ORG, "admin", "5,000", "2026-12-03", "Goodwill")).resolves.toEqual({});
    expect(m.grantCredits).toHaveBeenCalledWith(ORG, "admin", 5000, "2026-12-03", "admin-1", "Goodwill");
  });

  it("says plainly when a take-back is more than is left", async () => {
    m.takeBackCredits.mockResolvedValue("too_many");
    await expect(takeBackCreditsAction(ORG, GRANT, "10", "x")).resolves.toEqual({ error: "That's more than is left on these credits." });
  });

  it("ends credits now when no day is given", async () => {
    m.setGrantEnd.mockResolvedValue("ok");
    await expect(setGrantEndAction(ORG, GRANT, null, "Stop")).resolves.toEqual({});
    expect(m.setGrantEnd).toHaveBeenCalledWith(GRANT, null, "admin-1", "Stop");
  });

  it("hides database errors behind plain words", async () => {
    m.setGrantEnd.mockRejectedValue(new Error("connection reset"));
    await expect(setGrantEndAction(ORG, GRANT, "2026-12-10", "x")).resolves.toEqual({ error: "Could not save the change. Try again." });
  });
});
