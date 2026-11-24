import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  listAdminModels: vi.fn(),
  listAdminPrices: vi.fn(),
  updateAiModelRow: vi.fn(),
  insertAiModelPrice: vi.fn(),
  deleteAiModelPrice: vi.fn(),
  replaceAiModelPrice: vi.fn(),
  reorderAiModels: vi.fn(),
  getAiCatalog: vi.fn(),
  clearAiCatalogCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: m.requireSuperAdmin }));
vi.mock("@/lib/db/ai-models-admin", () => ({
  getAdminModel: m.getAdminModel,
  listAdminModels: m.listAdminModels,
  listAdminPrices: m.listAdminPrices,
  updateAiModelRow: m.updateAiModelRow,
  insertAiModelPrice: m.insertAiModelPrice,
  deleteAiModelPrice: m.deleteAiModelPrice,
  replaceAiModelPrice: m.replaceAiModelPrice,
  reorderAiModels: m.reorderAiModels,
}));
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: m.getAiCatalog, clearAiCatalogCache: m.clearAiCatalogCache }));
vi.mock("@/lib/ai-models/runnable-keys", () => ({
  RUNNABLE_ADAPTER_KEYS: new Set(seededModelCatalog().models.filter((x) => x.status !== "retired").map((x) => x.adapterKey)),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import {
  updateAiModelAction,
  addAiModelPriceAction,
  cancelAiModelPriceAction,
  replaceAiModelPriceAction,
  reorderAiModelsAction,
  undoAiModelPriceAction,
} from "./ai-models";

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
  m.listAdminModels.mockResolvedValue(catalog.models.map((x) => ({ raw: raw(x), model: x, problems: [], updatedBy: null })));
  m.getAiCatalog.mockResolvedValue(catalog);
  m.updateAiModelRow.mockResolvedValue(undefined);
  m.insertAiModelPrice.mockResolvedValue({ id: "new" });
  m.deleteAiModelPrice.mockResolvedValue({ deleted: true });
  m.replaceAiModelPrice.mockResolvedValue({ replaced: true, id: "new" });
  m.reorderAiModels.mockResolvedValue(undefined);
});

describe("updateAiModelAction", () => {
  it("writes a valid change once, clears the cache, revalidates", async () => {
    expect(await updateAiModelAction(NANO_PRO, { label: "Pro 2" })).toEqual({});
    expect(m.updateAiModelRow).toHaveBeenCalledTimes(1);
    expect(m.updateAiModelRow).toHaveBeenCalledWith(NANO_PRO, { label: "Pro 2" }, "u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models");
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models/[id]", "page");
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
  it("checks the replacement against a fresh read, not the cached catalog", async () => {
    const SUNBURST = "openai:gpt-image-2.5-sunburst";
    // Live in the cached catalog, hidden in the database now.
    m.listAdminModels.mockResolvedValue(
      catalog.models.map((x) => {
        const fresh = x.id === SUNBURST ? { ...x, status: "hidden" as const } : x;
        return { raw: raw(fresh), model: fresh, problems: [], updatedBy: null };
      }),
    );
    const r = await updateAiModelAction(NANO_PRO, { status: "retired", replaced_by: SUNBURST });
    expect(r).toEqual({ error: "Pick a live model of the same kind as the replacement." });
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
  });
  it("checks a model going live against a fresh read of its prices, not the cached catalog", async () => {
    m.getAdminModel.mockResolvedValue({ raw: { ...raw(model), status: "hidden" }, model: { ...model, status: "hidden" }, problems: [], updatedBy: null });
    m.listAdminPrices.mockResolvedValue([]);
    const r = await updateAiModelAction(NANO_PRO, { status: "live" });
    expect(r).toEqual({ error: "This model needs a price before it can go live." });
    expect(m.listAdminPrices).toHaveBeenCalledWith(NANO_PRO);
    expect(m.getAiCatalog).not.toHaveBeenCalled();
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
    const started = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
    m.listAdminPrices.mockResolvedValue([{ price: started, problems: [], id: started.id, modelId: NANO_PRO, effectiveFrom: started.effectiveFrom }]);
    expect(await updateAiModelAction(NANO_PRO, { status: "live" })).toEqual({});
  });
  it("refuses retiring an image or video model with no replacement", async () => {
    expect(await updateAiModelAction(NANO_PRO, { status: "retired" })).toEqual({ error: "Pick a live model of the same kind as the replacement." });
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
  });
  it("leaves out fresh rows that fail their check", async () => {
    const SUNBURST = "openai:gpt-image-2.5-sunburst";
    m.listAdminModels.mockResolvedValue(
      catalog.models.map((x) => ({ raw: raw(x), model: x.id === SUNBURST ? null : x, problems: [], updatedBy: null })),
    );
    const r = await updateAiModelAction(NANO_PRO, { status: "retired", replaced_by: SUNBURST });
    expect(r).toEqual({ error: "Pick a live model of the same kind as the replacement." });
  });
});

describe("guards", () => {
  it("does nothing when the caller is not a super admin", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(updateAiModelAction(NANO_PRO, { label: "x" })).rejects.toThrow();
    await expect(addAiModelPriceAction({ modelId: NANO_PRO, effectiveFrom: future(), lines, estimate: {} })).rejects.toThrow();
    await expect(cancelAiModelPriceAction("p1", NANO_PRO)).rejects.toThrow();
    expect(m.getAdminModel).not.toHaveBeenCalled();
    expect(m.getAiCatalog).not.toHaveBeenCalled();
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
    expect(m.deleteAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses malformed input instead of throwing", async () => {
    const brk = { error: "These changes would break the model's settings." };
    expect(await updateAiModelAction(NANO_PRO, null as never)).toEqual(brk);
    expect(await updateAiModelAction(NANO_PRO, [] as never)).toEqual(brk);
    const base = { modelId: NANO_PRO, effectiveFrom: future() };
    expect(await addAiModelPriceAction({ ...base, lines: "x", estimate: {} } as never)).toEqual(brk);
    expect(await addAiModelPriceAction({ ...base, lines: [null], estimate: {} } as never)).toEqual(brk);
    expect(await addAiModelPriceAction({ ...base, lines, estimate: null } as never)).toEqual(brk);
    expect(m.updateAiModelRow).not.toHaveBeenCalled();
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("does not report a failed save when only the revalidate fails", async () => {
    m.revalidatePath.mockImplementation(() => { throw new Error("x"); });
    await expect(updateAiModelAction(NANO_PRO, { label: "x" })).rejects.toThrow();
    expect(m.updateAiModelRow).toHaveBeenCalledTimes(1);
    m.revalidatePath.mockReset();
  });
});

describe("D547 a row the catalog dropped", () => {
  it("can still be patched from its raw row", async () => {
    m.getAdminModel.mockResolvedValue({ raw: raw(model), model: null, problems: ["x"], updatedBy: null });
    expect(await updateAiModelAction(NANO_PRO, { label: "Fixed" })).toEqual({});
    expect(m.updateAiModelRow).toHaveBeenCalledWith(NANO_PRO, { label: "Fixed" }, "u1");
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
    const at = future();
    expect(await addAiModelPriceAction(input({ effectiveFrom: at, sourceUrl: "https://x.test", note: "n" }))).toEqual({ id: "new", effectiveFrom: new Date(at).toISOString() });
    expect(m.insertAiModelPrice).toHaveBeenCalledTimes(1);
    expect(m.insertAiModelPrice.mock.calls[0][0]).toMatchObject({ modelId: NANO_PRO, lines, sourceUrl: "https://x.test", note: "n" });
    expect(m.insertAiModelPrice.mock.calls[0][1]).toBe("u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models/[id]", "page");
  });
  it("takes only a web address as the source, or none", async () => {
    const SOURCE = { error: "Enter a full web address for the source, or leave it empty." };
    for (const sourceUrl of ["javascript:alert(1)", "ftp://x.test/p", "example.com/pricing", "not a url", 42]) {
      expect(await addAiModelPriceAction(input({ sourceUrl })), String(sourceUrl)).toEqual(SOURCE);
    }
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
    expect(await addAiModelPriceAction(input({ sourceUrl: "http://x.test/p" }))).not.toHaveProperty("error");
    expect(await addAiModelPriceAction(input({ sourceUrl: "" }))).not.toHaveProperty("error");
    expect(m.insertAiModelPrice.mock.calls[1][0]).toMatchObject({ sourceUrl: null });
  });
  it("hides a raw database error", async () => {
    m.insertAiModelPrice.mockRejectedValue(new Error("boom"));
    expect(await addAiModelPriceAction(input())).toEqual({ error: GENERIC });
  });
  it("moves a start in the next 2 minutes out to 2 minutes and returns it; now stays now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    try {
      expect(await addAiModelPriceAction(input({ effectiveFrom: "2026-06-01T12:00:30Z" }))).toEqual({ id: "new", effectiveFrom: "2026-06-01T12:02:00.000Z" });
      expect(m.insertAiModelPrice.mock.calls[0][0]).toMatchObject({ effectiveFrom: "2026-06-01T12:02:00.000Z" });
      expect(await addAiModelPriceAction(input({ effectiveFrom: "2026-06-01T12:00:00Z" }))).toEqual({ id: "new", effectiveFrom: "2026-06-01T12:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("starts a Now price at the server's time, whatever the browser's clock says", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    try {
      const { effectiveFrom: _, ...rest } = input();
      expect(await addAiModelPriceAction({ ...rest, now: true })).toEqual({ id: "new", effectiveFrom: "2026-06-01T12:00:00.000Z" });
      expect(m.insertAiModelPrice.mock.calls[0][0]).toMatchObject({ effectiveFrom: "2026-06-01T12:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("revalidates the Credits page too, whose typical runs use these prices", async () => {
    await addAiModelPriceAction(input());
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/credits");
  });
  it("checks the caller first", async () => {
    await addAiModelPriceAction(input());
    expect(calls[0]).toBe("auth");
  });
});

describe("cancelAiModelPriceAction", () => {
  it("refuses a price starting within 2 minutes, or started, from a fresh read, and deletes nothing", async () => {
    m.listAdminPrices.mockResolvedValue([priceRow("p1", new Date(Date.now() + 90_000).toISOString())]);
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({ error: "This change starts in less than 2 minutes and can't be changed now." });
    expect(m.listAdminPrices).toHaveBeenCalledWith(NANO_PRO);
    m.listAdminPrices.mockResolvedValue([priceRow("p1", new Date(Date.now() - 1_000).toISOString())]);
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({ error: "Only a price that hasn't started can be cancelled." });
    expect(m.deleteAiModelPrice).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("cancels a price starting after the lead time", async () => {
    m.listAdminPrices.mockResolvedValue([priceRow("p1", new Date(Date.now() + 600_000).toISOString())]);
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({});
    expect(m.deleteAiModelPrice).toHaveBeenCalledWith("p1", NANO_PRO);
  });
  it("cancels and clears the cache", async () => {
    expect(await cancelAiModelPriceAction("p1", NANO_PRO)).toEqual({});
    expect(m.deleteAiModelPrice).toHaveBeenCalledWith("p1", NANO_PRO);
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models/[id]", "page");
  });
  it("deletes nothing under the wrong model", async () => {
    m.deleteAiModelPrice.mockImplementation(async (_id: string, modelId: string) => ({ deleted: modelId === NANO_PRO }));
    expect(await cancelAiModelPriceAction("p1", "other")).toEqual({ error: "Only a price that hasn't started can be cancelled." });
    expect(m.deleteAiModelPrice).toHaveBeenCalledWith("p1", "other");
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
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

const priceRow = (id: string, effectiveFrom: string, over: Record<string, unknown> = {}) => ({
  id, modelId: NANO_PRO, effectiveFrom, createdAt: effectiveFrom, createdBy: "u1", createdByName: "Ann", problems: [], raw: {},
  price: { id, modelId: NANO_PRO, effectiveFrom, lines, estimate: {}, sourceUrl: null, note: null },
  ...over,
});

describe("replaceAiModelPriceAction", () => {
  const REPLACE = { error: "Only a price that hasn't started can be replaced." };
  const at = future();
  const input = (over = {}) => ({ replaceId: "old", modelId: NANO_PRO, effectiveFrom: at, lines, estimate: {}, ...over });
  beforeEach(() => { m.listAdminPrices.mockResolvedValue([priceRow("old", at)]); });

  it("replaces in one rpc call at the same start, the replaced row left out of the taken-start check", async () => {
    expect(await replaceAiModelPriceAction(input({ note: "n" }))).toEqual({ id: "new", effectiveFrom: new Date(at).toISOString() });
    expect(m.replaceAiModelPrice).toHaveBeenCalledTimes(1);
    expect(m.replaceAiModelPrice).toHaveBeenCalledWith(
      "old",
      { modelId: NANO_PRO, effectiveFrom: new Date(at).toISOString(), lines, estimate: {}, sourceUrl: null, note: "n" },
      "u1",
    );
    expect(m.listAdminPrices).toHaveBeenCalledWith(NANO_PRO);
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
    expect(m.deleteAiModelPrice).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models/[id]", "page");
  });
  it("still refuses a start another row holds", async () => {
    const other = future().replace(/\.\d+Z$/, ".500Z");
    m.listAdminPrices.mockResolvedValue([priceRow("old", at), priceRow("p2", other)]);
    expect(await replaceAiModelPriceAction(input({ effectiveFrom: other }))).toEqual({ error: "This model already has a price starting then." });
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses a row that is not this model's", async () => {
    expect(await replaceAiModelPriceAction(input({ replaceId: "elsewhere" }))).toEqual(REPLACE);
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("refuses a row that has started", async () => {
    m.listAdminPrices.mockResolvedValue([priceRow("old", new Date(Date.now() - 1_000).toISOString())]);
    expect(await replaceAiModelPriceAction(input())).toEqual(REPLACE);
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses a row starting within 2 minutes", async () => {
    m.listAdminPrices.mockResolvedValue([priceRow("old", new Date(Date.now() + 90_000).toISOString())]);
    expect(await replaceAiModelPriceAction(input())).toEqual({ error: "This change starts in less than 2 minutes and can't be changed now." });
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses when the database finds the row started meanwhile", async () => {
    m.replaceAiModelPrice.mockResolvedValue({ replaced: false });
    expect(await replaceAiModelPriceAction(input())).toEqual(REPLACE);
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("runs the price checks and writes nothing when they refuse", async () => {
    expect(await replaceAiModelPriceAction(input({ effectiveFrom: "2020-01-01T00:00:00Z" }))).toEqual({ error: "A price can't start in the past." });
    expect(await replaceAiModelPriceAction(input({ sourceUrl: "javascript:x" }))).toEqual({ error: "Enter a full web address for the source, or leave it empty." });
    expect(await replaceAiModelPriceAction(input({ replaceId: 5 }) as never)).toEqual({ error: "These changes would break the model's settings." });
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
  });
  it("hides a raw database error", async () => {
    m.replaceAiModelPrice.mockRejectedValue(new Error("duplicate key"));
    expect(await replaceAiModelPriceAction(input())).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalled();
  });
  it("checks the caller first", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(replaceAiModelPriceAction(input())).rejects.toThrow();
    expect(m.listAdminPrices).not.toHaveBeenCalled();
    expect(m.replaceAiModelPrice).not.toHaveBeenCalled();
  });
});

describe("reorderAiModelsAction", () => {
  const videoIds = catalog.models.filter((x) => x.kind === "video").map((x) => x.id);
  const ORDER = { error: "The list of models changed. Reload and try again." };

  it("writes a new order of every model of the kind in one call", async () => {
    const order = [...videoIds].reverse();
    expect(await reorderAiModelsAction("video", order)).toEqual({});
    expect(m.reorderAiModels).toHaveBeenCalledTimes(1);
    expect(m.reorderAiModels).toHaveBeenCalledWith("video", order, "u1");
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/models");
  });
  it("refuses a missing, duplicated, unknown or other-kind id and writes nothing", async () => {
    const image = catalog.models.find((x) => x.kind === "image")!.id;
    expect(await reorderAiModelsAction("video", videoIds.slice(1))).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [...videoIds.slice(1), videoIds[1]])).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [...videoIds.slice(1), "nope"])).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [...videoIds.slice(1), image])).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [...videoIds, image])).toEqual(ORDER);
    expect(m.reorderAiModels).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("counts rows that fail their check by their raw kind", async () => {
    m.listAdminModels.mockResolvedValue(
      catalog.models.map((x) => ({ raw: raw(x), model: x.id === videoIds[0] ? null : x, problems: [], updatedBy: null })),
    );
    expect(await reorderAiModelsAction("video", videoIds.slice(1))).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [...videoIds].reverse())).toEqual({});
  });
  it("writes nothing when the order is the one stored", async () => {
    m.listAdminModels.mockResolvedValue(
      videoIds.map((id, i) => { const x = catalog.models.find((c) => c.id === id)!; return { raw: { ...raw(x), sort_order: i }, model: x, problems: [], updatedBy: null }; }),
    );
    expect(await reorderAiModelsAction("video", videoIds)).toEqual({});
    expect(m.reorderAiModels).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("refuses malformed input", async () => {
    expect(await reorderAiModelsAction("video", "x" as never)).toEqual(ORDER);
    expect(await reorderAiModelsAction(5 as never, videoIds)).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [5] as never)).toEqual(ORDER);
    expect(await reorderAiModelsAction("video", [])).toEqual(ORDER);
    expect(m.reorderAiModels).not.toHaveBeenCalled();
  });
  it("hides a raw database error", async () => {
    m.reorderAiModels.mockRejectedValue(new Error("boom"));
    expect(await reorderAiModelsAction("video", [...videoIds].reverse())).toEqual({ error: GENERIC });
  });
  it("checks the caller first", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(reorderAiModelsAction("video", videoIds)).rejects.toThrow();
    expect(m.listAdminModels).not.toHaveBeenCalled();
  });
});

describe("undoAiModelPriceAction", () => {
  const NOW = new Date("2026-11-24T12:00:00Z");
  const UNDO = { error: "Only the latest price change you made in the last 24 hours can be undone." };
  const oldLines = [{ meter: "output_image" as const, unit_usd: 0.05 }];
  const previous = priceRow("p1", "2026-10-01T00:00:00.000Z", {
    price: { id: "p1", modelId: NANO_PRO, effectiveFrom: "2026-10-01T00:00:00.000Z", lines: oldLines, estimate: { thought_token: 100 }, sourceUrl: null, note: null },
  });
  const latest = priceRow("p2", "2026-11-24T10:00:00.000Z");
  const scheduled = priceRow("p3", "2026-12-03T00:00:00.000Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    m.listAdminPrices.mockResolvedValue([latest, previous]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("adds a row live now with the earlier price's lines and estimate", async () => {
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ id: "new", effectiveFrom: NOW.toISOString() });
    expect(m.listAdminPrices).toHaveBeenCalledWith(NANO_PRO);
    expect(m.insertAiModelPrice).toHaveBeenCalledTimes(1);
    expect(m.insertAiModelPrice).toHaveBeenCalledWith(
      { modelId: NANO_PRO, effectiveFrom: NOW.toISOString(), lines: oldLines, estimate: { thought_token: 100 }, sourceUrl: null, note: "Undo of the 24 Nov 2026 change" },
      "u1",
    );
    expect(m.deleteAiModelPrice).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).toHaveBeenCalledTimes(1);
  });
  it("refuses while a change is scheduled", async () => {
    m.listAdminPrices.mockResolvedValue([scheduled, latest, previous]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ error: "There's a change scheduled. Cancel it first, then undo." });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses anything but the latest started row, and writes nothing", async () => {
    m.listAdminPrices.mockResolvedValue([scheduled, latest, previous]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p1")).toEqual(UNDO);
    expect(await undoAiModelPriceAction(NANO_PRO, "p3")).toEqual(UNDO);
    expect(await undoAiModelPriceAction(NANO_PRO, "elsewhere")).toEqual(UNDO);
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
    expect(m.clearAiCatalogCache).not.toHaveBeenCalled();
  });
  it("refuses a change another admin made", async () => {
    m.listAdminPrices.mockResolvedValue([{ ...latest, createdBy: "u2" }, previous]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual(UNDO);
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses a change made more than 24 hours ago", async () => {
    m.listAdminPrices.mockResolvedValue([{ ...latest, createdAt: "2026-11-23T11:59:00.000Z" }, previous]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual(UNDO);
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses when there is no earlier price, and logs an earlier price that fails its check", async () => {
    m.listAdminPrices.mockResolvedValue([latest]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ error: "There is no earlier price to go back to." });
    m.listAdminPrices.mockResolvedValue([latest, { ...previous, price: null }]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ error: GENERIC });
    expect(console.error).toHaveBeenCalled();
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("runs the price checks on the restored price", async () => {
    m.listAdminPrices.mockResolvedValue([latest, priceRow("p1", previous.effectiveFrom, {
      price: { ...previous.price, lines: [{ meter: "output_image", unit_usd: 0.05, when: { resolution: "720p" } }] },
    })]);
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ error: "A price condition names a setting this model doesn't have." });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("refuses an unknown model and malformed ids", async () => {
    expect(await undoAiModelPriceAction("nope", "p2")).toEqual({ error: GENERIC });
    expect(await undoAiModelPriceAction(NANO_PRO, 5 as never)).toEqual({ error: GENERIC });
    expect(m.insertAiModelPrice).not.toHaveBeenCalled();
  });
  it("hides a raw database error", async () => {
    m.insertAiModelPrice.mockRejectedValue(new Error("boom"));
    expect(await undoAiModelPriceAction(NANO_PRO, "p2")).toEqual({ error: GENERIC });
  });
  it("checks the caller first", async () => {
    m.requireSuperAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(undoAiModelPriceAction(NANO_PRO, "p2")).rejects.toThrow();
    expect(m.listAdminPrices).not.toHaveBeenCalled();
  });
});
