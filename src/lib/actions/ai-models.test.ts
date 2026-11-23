import { describe, it, expect, vi, beforeEach } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { AiModel } from "@/lib/ai-models/types";

const calls: string[] = [];
const catalog = seededModelCatalog();
const NANO_PRO = "gemini:gemini-3-pro-image";
const model = catalog.models.find((m) => m.id === NANO_PRO)!;
const raw = (m: AiModel) => ({
  id: m.id, provider: m.provider, kind: m.kind, label: m.label, picker_label: m.pickerLabel,
  provider_label: m.providerLabel, description: m.description, status: m.status, replaced_by: m.replacedBy,
  sort_order: m.sortOrder, adapter_key: m.adapterKey, provider_model_id: m.providerModelId,
  params: m.params, rules: m.rules, capabilities: m.capabilities, updated_at: m.updatedAt,
});

const m = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  getAdminModel: vi.fn(),
  listAdminPrices: vi.fn(),
  updateAiModelRow: vi.fn(),
  insertAiModelPrice: vi.fn(),
  deleteAiModelPrice: vi.fn(),
  getAiCatalog: vi.fn(),
  clearAiCatalogCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("@/lib/db/ai-models-admin", () => ({
  getAdminModel: m.getAdminModel,
  listAdminPrices: m.listAdminPrices,
  updateAiModelRow: m.updateAiModelRow,
  insertAiModelPrice: m.insertAiModelPrice,
  deleteAiModelPrice: m.deleteAiModelPrice,
}));
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: m.getAiCatalog, clearAiCatalogCache: m.clearAiCatalogCache }));
vi.mock("@/lib/ai-models/runnable-keys", () => ({
  RUNNABLE_ADAPTER_KEYS: new Set(seededModelCatalog().models.filter((x) => x.status !== "retired").map((x) => x.adapterKey)),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { updateAiModelAction, addAiModelPriceAction, cancelAiModelPriceAction } from "./ai-models";

const GENERIC = "Could not save. Try again.";
const future = () => new Date(Date.now() + 86_400_000 * 30).toISOString();
const lines = [{ meter: "output_image" as const, unit_usd: 0.1 }];

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireSuperAdmin.mockImplementation(async () => { calls.push("auth"); return { userId: "u1" }; });
  m.getAdminModel.mockImplementation(async (id: string) => { calls.push("read"); return id === NANO_PRO ? { raw: raw(model), model, problems: [], updatedBy: null } : null; });
  m.listAdminPrices.mockResolvedValue([]);
  m.getAiCatalog.mockResolvedValue(catalog);
  m.updateAiModelRow.mockResolvedValue(undefined);
  m.insertAiModelPrice.mockResolvedValue(undefined);
  m.deleteAiModelPrice.mockResolvedValue({ deleted: true });
});

describe("updateAiModelAction", () => {
  it("writes a valid change once, clears the cache, revalidates", async () => {
    expect(await updateAiModelAction(NANO_PRO, { label: "Pro 2" })).toEqual({});
    expect(m.updateAiModelRow).toHaveBeenCalledTimes(1);
    expect(m.updateAiModelRow).toHaveBeenCalledWith(NANO_PRO, { label: "Pro 2" }, "u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models");
    expect(m.revalidatePath).toHaveBeenCalledWith(`/admin/models/${NANO_PRO}`);
  });
  it("writes nothing when the check refuses", async () => {
    const r = await updateAiModelAction(NANO_PRO, { params: [] });
    expect(r.error).toBe("These changes would break the model's settings.");
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("answers an unknown model with the generic error", async () => {
    expect(await updateAiModelAction("nope", { label: "x" })).toEqual({ error: GENERIC });
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
  });
  it("hides a raw database error", async () => {
    m.updateAiModelRow.mockRejectedValue(new Error("duplicate key value violates"));
    expect(await updateAiModelAction(NANO_PRO, { label: "x" })).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("checks the caller first", async () => {
    await updateAiModelAction(NANO_PRO, { label: "x" });
    expect(calls[0]).toBe("auth");
  });
});

describe("addAiModelPriceAction", () => {
  const input = (over = {}) => ({ modelId: NANO_PRO, effectiveFrom: future(), lines, estimate: {}, ...over });
  it("refuses a start in the past and inserts nothing", async () => {
    const r = await addAiModelPriceAction(input({ effectiveFrom: "2020-01-01T00:00:00Z" }));
    expect(r).toEqual({ error: "A price can't start in the past." });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses a start already taken, even by a row that fails its check", async () => {
    const at = future();
    m.listAdminPrices.mockResolvedValue([{ price: null, problems: ["x"], id: "p", modelId: NANO_PRO, effectiveFrom: at }]);
    const r = await addAiModelPriceAction(input({ effectiveFrom: at }));
    expect(r).toEqual({ error: "This model already has a price starting then." });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses an unparseable date", async () => {
    expect(await addAiModelPriceAction(input({ effectiveFrom: "soon" }))).toEqual({ error: GENERIC });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("inserts a valid price with the caller, clears the cache", async () => {
    expect(await addAiModelPriceAction(input({ sourceUrl: "https://x.test", note: "n" }))).toEqual({});
    expect(m.insertAiModelPrice).toHaveBeenCalledTimes(1);
    expect(m.insertAiModelPrice.mock.calls[0][0]).toMatchObject({ modelId: NANO_PRO, lines, sourceUrl: "https://x.test", note: "n" });
    expect(m.insertAiModelPrice.mock.calls[0][1]).toBe("u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith(`/admin/models/${NANO_PRO}`);
  });
  it("hides a raw database error", async () => {
    m.insertAiModelPrice.mockRejectedValue(new Error("boom"));
    expect(await addAiModelPriceAction(input())).toEqual({ error: GENERIC });
  });
  it("checks the caller first", async () => {
    await addAiModelPriceAction(input());
    expect(calls[0]).toBe("auth");
  });
});

describe("cancelAiModelPriceAction", () => {
  it("cancels and clears the cache", async () => {
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({});
    expect(m.deleteAiModelPrice).toHaveBeenCalledWith("p1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith(`/admin/models/${NANO_PRO}`);
  });
  it("refuses a price that has started", async () => {
    m.deleteAiModelPrice.mockResolvedValue({ deleted: false });
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({ error: "Only a price that hasn't started can be cancelled." });
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("hides a raw database error", async () => {
    m.deleteAiModelPrice.mockRejectedValue(new Error("boom"));
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({ error: GENERIC });
  });
  it("checks the caller first", async () => {
    await cancelAiModelPriceAction("p1", NANO_PRO);
    expect(calls[0]).toBe("auth");
  });
});
