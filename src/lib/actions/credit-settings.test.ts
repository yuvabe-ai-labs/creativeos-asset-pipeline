import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const calls: string[] = [];
const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  listAdminCreditSettings: vi.fn(),
  insertCreditSettings: vi.fn(),
  deleteCreditSettings: vi.fn(),
  replaceCreditSettings: vi.fn(),
  clearAiCatalogCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("@/lib/db/credit-settings-admin", () => ({
  listAdminCreditSettings: m.listAdminCreditSettings,
  insertCreditSettings: m.insertCreditSettings,
  deleteCreditSettings: m.deleteCreditSettings,
  replaceCreditSettings: m.replaceCreditSettings,
}));
vi.mock("@/lib/ai-models/catalog", () => ({ clearAiCatalogCache: m.clearAiCatalogCache }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { addCreditSettingsAction, cancelCreditSettingsAction, replaceCreditSettingsAction, undoCreditSettingsAction } from "./credit-settings";

const GENERIC = "Could not save. Try again.";
const future = () => new Date(Date.now() + 86_400_000 * 30).toISOString();
const input = (over: Record<string, unknown> = {}) => ({ effectiveFrom: future(), marginPercent: 20, roundStep: 5, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireSuperAdmin.mockImplementation(async () => { calls.push("auth"); return { userId: "u1" }; });
  m.listAdminCreditSettings.mockImplementation(async () => { calls.push("read"); return []; });
  m.insertCreditSettings.mockResolvedValue({ id: "new1" });
  m.deleteCreditSettings.mockResolvedValue({ deleted: true });
  m.replaceCreditSettings.mockResolvedValue({ replaced: true, id: "rep1" });
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
    expect(await addCreditSettingsAction(input({ effectiveFrom: at, note: " hi " }))).toEqual({ id: "new1", effectiveFrom: new Date(at).toISOString() });
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
      expect(res).toEqual({ id: "new1", effectiveFrom: "2026-06-01T12:02:00.000Z" });
      expect(m.insertCreditSettings).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: "2026-06-01T12:02:00.000Z" }), "u1");
    } finally {
      vi.useRealTimers();
    }
  });
  it("starts a Now change from the server's time, moved out by the lead as any start that is too soon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    try {
      const res = await addCreditSettingsAction({ now: true, marginPercent: 20, roundStep: 5 });
      expect(res).toEqual({ id: "new1", effectiveFrom: "2026-06-01T12:02:00.000Z" });
      expect(m.insertCreditSettings).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: "2026-06-01T12:02:00.000Z" }), "u1");
    } finally {
      vi.useRealTimers();
    }
  });
  it("revalidates the models pages too, which show credits at these settings", async () => {
    await addCreditSettingsAction(input());
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models");
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models/[id]", "page");
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

describe("undoCreditSettingsAction", () => {
  const NOW = new Date("2026-11-24T12:00:00Z");
  const UNDO = { error: "Only the latest change you made in the last 24 hours can be undone." };
  const settingsRow = (id: string, effectiveFrom: string, marginPercent: number, roundStep: 1 | 5 | 10, over: Record<string, unknown> = {}) => ({
    id, effectiveFrom, createdAt: effectiveFrom, createdBy: "u1", createdByName: "Ann", problems: [],
    settings: { id, effectiveFrom, marginPercent, roundStep, note: null },
    ...over,
  });
  const previous = settingsRow("c1", "2026-01-01T00:00:00.000Z", 0, 5);
  const latest = settingsRow("c2", "2026-11-24T10:00:00.000Z", 20, 10);
  const scheduled = settingsRow("c3", "2026-12-03T00:00:00.000Z", 30, 10);
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    m.listAdminCreditSettings.mockImplementation(async () => { calls.push("read"); return [latest, previous]; });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("adds a row with the earlier settings that starts in 2 minutes, and says when", async () => {
    expect(await undoCreditSettingsAction("c2")).toEqual({ id: "new1", effectiveFrom: "2026-11-24T12:02:00.000Z" });
    expect(m.insertCreditSettings).toHaveBeenCalledTimes(1);
    expect(m.insertCreditSettings).toHaveBeenCalledWith(
      { effectiveFrom: "2026-11-24T12:02:00.000Z", marginPercent: 0, roundStep: 5, note: "Undo of the 24 Nov 2026 change" },
      "u1",
    );
    expect(m.deleteCreditSettings).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/credits");
    expect(calls).toEqual(["auth", "read"]);
  });
  it("refuses while a change is scheduled, including the row a first Undo just added", async () => {
    const SCHEDULED = { error: "There's a change scheduled. Cancel it first, then undo." };
    m.listAdminCreditSettings.mockResolvedValue([scheduled, latest, previous]);
    expect(await undoCreditSettingsAction("c2")).toEqual(SCHEDULED);
    m.listAdminCreditSettings.mockResolvedValue([settingsRow("c4", "2026-11-24T12:02:00.000Z", 0, 5), latest, previous]);
    expect(await undoCreditSettingsAction("c2")).toEqual(SCHEDULED);
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
  });
  it("refuses anything but the latest started row, and writes nothing", async () => {
    m.listAdminCreditSettings.mockResolvedValue([scheduled, latest, previous]);
    expect(await undoCreditSettingsAction("c1")).toEqual(UNDO);
    expect(await undoCreditSettingsAction("c3")).toEqual(UNDO);
    expect(await undoCreditSettingsAction("nope")).toEqual(UNDO);
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("refuses a change another admin made, or one made more than 24 hours ago", async () => {
    m.listAdminCreditSettings.mockResolvedValue([{ ...latest, createdBy: "u2" }, previous]);
    expect(await undoCreditSettingsAction("c2")).toEqual(UNDO);
    m.listAdminCreditSettings.mockResolvedValue([{ ...latest, createdAt: "2026-11-23T11:59:00.000Z" }, previous]);
    expect(await undoCreditSettingsAction("c2")).toEqual(UNDO);
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
  });
  it("refuses when there is no earlier row, and logs an earlier row that fails its check", async () => {
    m.listAdminCreditSettings.mockResolvedValue([latest]);
    expect(await undoCreditSettingsAction("c2")).toEqual({ error: "There are no earlier settings to go back to." });
    m.listAdminCreditSettings.mockResolvedValue([latest, { ...previous, settings: null }]);
    expect(await undoCreditSettingsAction("c2")).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalled();
    expect(m.insertCreditSettings).not.toHaveBeenCalled();
  });
  it("guards the id's shape and hides a raw database error", async () => {
    expect(await undoCreditSettingsAction(5 as never)).toEqual({ error: GENERIC });
    const err = new Error("db down");
    m.insertCreditSettings.mockRejectedValue(err);
    expect(await undoCreditSettingsAction("c2")).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalledWith("undoCreditSettingsAction failed", "c2", err);
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("checks the caller first", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("nope"));
    await expect(undoCreditSettingsAction("c2")).rejects.toThrow("nope");
    expect(m.listAdminCreditSettings).not.toHaveBeenCalled();
  });
});

describe("replaceCreditSettingsAction", () => {
  const at = () => new Date(Date.now() + 86_400_000 * 3);
  const scheduled = () => ({ id: "s1", effectiveFrom: at().toISOString() });
  const input = (over: Record<string, unknown> = {}) => ({ replaceId: "s1", effectiveFrom: at().toISOString(), marginPercent: 10, roundStep: 10, ...over });

  it("checks the caller first, then reads fresh", async () => {
    m.listAdminCreditSettings.mockImplementation(async () => { calls.push("read"); return [scheduled()]; });
    await replaceCreditSettingsAction(input());
    expect(calls).toEqual(["auth", "read"]);
  });
  it("lets a refusal from the caller check through and writes nothing", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("nope"));
    await expect(replaceCreditSettingsAction(input())).rejects.toThrow("nope");
    expect(m.replaceCreditSettings).not.toHaveBeenCalled();
  });
  it("replaces at the replaced row's own start: that row is left out of the clash check", async () => {
    const s = scheduled();
    m.listAdminCreditSettings.mockResolvedValue([s, { id: "old", effectiveFrom: "2026-01-01T00:00:00.000Z" }]);
    const res = await replaceCreditSettingsAction(input({ effectiveFrom: s.effectiveFrom, note: " n " }));
    expect(res).toEqual({ id: "rep1", effectiveFrom: new Date(s.effectiveFrom).toISOString() });
    expect(m.replaceCreditSettings).toHaveBeenCalledWith("s1", { effectiveFrom: new Date(s.effectiveFrom).toISOString(), marginPercent: 10, roundStep: 10, note: "n" }, "u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/credits");
  });
  it("still refuses a clash with another row", async () => {
    const other = new Date(Date.now() + 86_400_000 * 4).toISOString();
    m.listAdminCreditSettings.mockResolvedValue([scheduled(), { id: "x", effectiveFrom: other }]);
    expect(await replaceCreditSettingsAction(input({ effectiveFrom: other }))).toEqual({ error: "There is already a change starting then." });
    expect(m.replaceCreditSettings).not.toHaveBeenCalled();
  });
  it("refuses an unknown row, a started row and a row inside the 2-minute lead, writing nothing", async () => {
    m.listAdminCreditSettings.mockResolvedValue([]);
    expect(await replaceCreditSettingsAction(input())).toEqual({ error: "Only a change that hasn't started can be replaced." });
    m.listAdminCreditSettings.mockResolvedValue([{ id: "s1", effectiveFrom: new Date(Date.now() - 1000).toISOString() }]);
    expect(await replaceCreditSettingsAction(input())).toEqual({ error: "Only a change that hasn't started can be replaced." });
    m.listAdminCreditSettings.mockResolvedValue([{ id: "s1", effectiveFrom: new Date(Date.now() + 90_000).toISOString() }]);
    expect(await replaceCreditSettingsAction(input())).toEqual({ error: "This change starts in less than 2 minutes and can't be replaced now." });
    expect(m.replaceCreditSettings).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("runs the settings checks and writes nothing when one refuses", async () => {
    m.listAdminCreditSettings.mockResolvedValue([scheduled()]);
    expect(await replaceCreditSettingsAction(input({ marginPercent: 250 }))).toEqual({ error: "The margin must be between 0% and 200%." });
    expect(await replaceCreditSettingsAction(input({ effectiveFrom: new Date(Date.now() - 3_600_000).toISOString() }))).toEqual({ error: "A change can't start in the past." });
    expect(m.replaceCreditSettings).not.toHaveBeenCalled();
  });
  it("says so when the database refuses because the row started meanwhile", async () => {
    m.listAdminCreditSettings.mockResolvedValue([scheduled()]);
    m.replaceCreditSettings.mockResolvedValue({ replaced: false });
    expect(await replaceCreditSettingsAction(input())).toEqual({ error: "Only a change that hasn't started can be replaced." });
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it.each([undefined, null, { replaceId: 5 }, { replaceId: "s1", effectiveFrom: 5 }, { replaceId: "s1", effectiveFrom: "nonsense", marginPercent: 1, roundStep: 1 }])(
    "guards the input's shape: %j",
    async (bad) => {
      m.listAdminCreditSettings.mockResolvedValue([scheduled()]);
      expect(await replaceCreditSettingsAction(bad as never)).toEqual({ error: GENERIC });
      expect(m.replaceCreditSettings).not.toHaveBeenCalled();
    },
  );
  it("hides a raw database error", async () => {
    m.listAdminCreditSettings.mockResolvedValue([scheduled()]);
    const err = new Error("db down");
    m.replaceCreditSettings.mockRejectedValue(err);
    expect(await replaceCreditSettingsAction(input())).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalledWith("replaceCreditSettingsAction failed", "s1", err);
  });
});
