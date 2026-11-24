import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  listAdminCreditSettings: vi.fn(),
  insertCreditSettings: vi.fn(),
  deleteCreditSettings: vi.fn(),
  clearAiCatalogCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("@/lib/db/credit-settings-admin", () => ({
  listAdminCreditSettings: m.listAdminCreditSettings,
  insertCreditSettings: m.insertCreditSettings,
  deleteCreditSettings: m.deleteCreditSettings,
}));
vi.mock("@/lib/ai-models/catalog", () => ({ clearAiCatalogCache: m.clearAiCatalogCache }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { addCreditSettingsAction, cancelCreditSettingsAction } from "./credit-settings";

const GENERIC = "Could not save. Try again.";
const future = () => new Date(Date.now() + 86_400_000 * 30).toISOString();
const input = (over: Record<string, unknown> = {}) => ({ effectiveFrom: future(), marginPercent: 20, roundStep: 5, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireSuperAdmin.mockImplementation(async () => { calls.push("auth"); return { userId: "u1" }; });
  m.listAdminCreditSettings.mockImplementation(async () => { calls.push("read"); return []; });
  m.insertCreditSettings.mockResolvedValue(undefined);
  m.deleteCreditSettings.mockResolvedValue({ deleted: true });
});

describe("addCreditSettingsAction", () => {
  it("checks the caller first, then reads", async () => {
    await addCreditSettingsAction(input());
    expect(calls).toEqual(["auth", "read"]);
  });
  it("lets a refusal from the caller check through and writes nothing", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("nope"));
    await expect(addCreditSettingsAction(input())).rejects.toThrow("nope");
    expect(m.listAdminCreditSettings).not.toHaveBeenCalled();
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
  });
  it("inserts a valid change with created_by, clears the cache and revalidates", async () => {
    const at = future();
    expect(await addCreditSettingsAction(input({ effectiveFrom: at, note: " hi " }))).toEqual({ effectiveFrom: new Date(at).toISOString() });
    expect(m.insertCreditSettings).toHaveBeenCalledWith(
      { effectiveFrom: new Date(at).toISOString(), marginPercent: 20, roundStep: 5, note: "hi" },
      "u1",
    );
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/credits");
  });
  it("moves a start that is too soon and returns the start the row got", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    try {
      const res = await addCreditSettingsAction(input({ effectiveFrom: new Date().toISOString() }));
      expect(res).toEqual({ effectiveFrom: "2026-06-01T12:02:00.000Z" });
      expect(m.insertCreditSettings).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: "2026-06-01T12:02:00.000Z" }), "u1");
    } finally {
      vi.useRealTimers();
    }
  });
  it("returns the check's message and writes nothing when a check refuses", async () => {
    expect(await addCreditSettingsAction(input({ marginPercent: 300 }))).toEqual({ error: "The margin must be between 0% and 200%." });
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("counts every existing row, so a taken start is refused", async () => {
    const at = future();
    m.listAdminCreditSettings.mockResolvedValue([{ effectiveFrom: at, settings: null }]);
    expect(await addCreditSettingsAction(input({ effectiveFrom: at }))).toEqual({ error: "There is already a change starting then." });
  });
  it.each([undefined, null, "x", { effectiveFrom: 5 }, { effectiveFrom: "nonsense", marginPercent: 1, roundStep: 1 }])(
    "refuses untyped input %#",
    async (bad) => {
      expect(await addCreditSettingsAction(bad as never)).toEqual({ error: GENERIC });
      expect(m.insertCreditSettings).not.toHaveBeenCalled();
    },
  );
  it("returns the plain message and logs the real error when the database fails", async () => {
    const err = new Error("db down");
    m.insertCreditSettings.mockRejectedValue(err);
    expect(await addCreditSettingsAction(input())).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalledWith("addCreditSettingsAction failed", err);
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
});

describe("cancelCreditSettingsAction", () => {
  it("refuses a row starting within 2 minutes and deletes nothing", async () => {
    m.listAdminCreditSettings.mockResolvedValue([{ id: "c1", effectiveFrom: new Date(Date.now() + 90_000).toISOString() }]);
    expect(await cancelCreditSettingsAction("c1")).toEqual({ error: "This change starts in less than 2 minutes and can't be cancelled now." });
    expect(m.deleteCreditSettings).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("deletes a row that starts after the lead time, matched by id", async () => {
    m.listAdminCreditSettings.mockResolvedValue([
      { id: "c0", effectiveFrom: new Date(Date.now() + 1_000).toISOString() },
      { id: "c1", effectiveFrom: new Date(Date.now() + 600_000).toISOString() },
    ]);
    expect(await cancelCreditSettingsAction("c1")).toEqual({});
    expect(m.deleteCreditSettings).toHaveBeenCalledWith("c1");
  });
  it("deletes by id, clears the cache and revalidates", async () => {
    expect(await cancelCreditSettingsAction("c1")).toEqual({});
    expect(m.deleteCreditSettings).toHaveBeenCalledWith("c1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/credits");
  });
  it("refuses a row that has started", async () => {
    m.deleteCreditSettings.mockResolvedValue({ deleted: false });
    expect(await cancelCreditSettingsAction("c1")).toEqual({ error: "Only a change that hasn't started can be cancelled." });
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("checks the caller first and guards the id's shape", async () => {
    expect(await cancelCreditSettingsAction(5 as never)).toEqual({ error: GENERIC });
    expect(calls).toEqual(["auth"]);
    expect(m.deleteCreditSettings).not.toHaveBeenCalled();
  });
  it("returns the plain message and logs the real error on a database failure", async () => {
    const err = new Error("db down");
    m.deleteCreditSettings.mockRejectedValue(err);
    expect(await cancelCreditSettingsAction("c1")).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalledWith("cancelCreditSettingsAction failed", "c1", err);
  });
});
