import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

type Result = { data?: unknown; error?: { message: string } | null };
const calls: { table: string; op: string; args: unknown[] }[] = [];
const results: Record<string, Result> = {};
let rpcResult: Result = { data: [], error: null };
const rpcCalls: { fn: string; args: unknown }[] = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
  for (const op of ["select", "order", "eq", "in", "update", "insert", "delete"]) b[op] = chain(op);
  b.then = (resolve: (v: Result) => unknown) => resolve({ error: null, ...(results[table] ?? { data: [] }) });
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return rpcResult; },
  }),
}));
import {
  listAdminModels,
  listAdminPrices,
  modelMonthStats,
  updateAiModelRow,
  deleteAiModelPrice,
  replaceAiModelPrice,
  reorderAiModels,
  modelRunsByAgency,
  REPLACE_STARTED_DB_MESSAGE,
} from "../ai-models-admin";

const goodRow = {
  id: "m1", provider: "p", kind: "text", label: "L", picker_label: null, provider_label: "P",
  description: null, status: "live", replaced_by: null, sort_order: 1, adapter_key: "a",
  provider_model_id: "x", params: [], rules: [], capabilities: {}, updated_at: "2026-01-01", updated_by: null,
};

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  rpcResult = { data: [], error: null };
});

describe("listAdminModels", () => {
  it("returns good and broken rows", async () => {
    results.ai_models = { data: [goodRow, { ...goodRow, id: "m2", params: [{ name: "" }] }] };
    const rows = await listAdminModels();
    expect(rows).toHaveLength(2);
    expect(rows[0].model?.id).toBe("m1");
    expect(rows[0].problems).toEqual([]);
    expect(rows[1].model).toBeNull();
    expect(rows[1].problems.length).toBeGreaterThan(0);
    expect(rows[1].raw.id).toBe("m2");
  });
});

describe("listAdminPrices", () => {
  it("maps created_by to a name with one profiles query", async () => {
    const price = (id: string, by: string | null) => ({
      id, model_id: "m", effective_from: "2026-01-01", lines: [{ meter: "provider_unit", unit_usd: 1 }],
      estimate: {}, source_url: null, note: null, created_at: "2026-01-02", created_by: by,
    });
    results.ai_model_prices = { data: [price("a", "u1"), price("b", "u2"), price("c", "u1")] };
    results.profiles = { data: [{ id: "u1", display_name: "Ann" }, { id: "u2", display_name: "Bo" }] };
    const rows = await listAdminPrices("m");
    expect(rows.map((r) => r.createdByName)).toEqual(["Ann", "Bo", "Ann"]);
    const inCalls = calls.filter((c) => c.table === "profiles" && c.op === "in");
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0].args[0]).toBe("id");
    expect([...(inCalls[0].args[1] as string[])].sort()).toEqual(["u1", "u2"]);
  });
});

describe("listAdminPrices broken rows", () => {
  it("keeps a row that fails its check", async () => {
    results.ai_model_prices = {
      data: [{ id: "bad", model_id: "m", effective_from: "2026-02-01", lines: [], estimate: {}, source_url: null, note: null, created_at: "2026-02-02", created_by: null }],
    };
    const rows = await listAdminPrices("m");
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBeNull();
    expect(rows[0].problems.length).toBeGreaterThan(0);
    expect([rows[0].id, rows[0].modelId, rows[0].effectiveFrom]).toEqual(["bad", "m", "2026-02-01"]);
  });
});

describe("modelMonthStats", () => {
  it("calls the rpc and maps numeric strings", async () => {
    rpcResult = {
      data: [
        { model_id: "a", runs: "3", cost_usd: "1.5", credits: "30", unpriced: "1" },
        { model_id: "b", runs: 2, cost_usd: 0, credits: 0, unpriced: 0 },
      ],
      error: null,
    };
    const all = await modelMonthStats("f", "t");
    expect(rpcCalls[0]).toEqual({ fn: "ai_model_month_stats", args: { p_from: "f", p_to: "t" } });
    expect(all[0]).toEqual({ modelId: "a", runs: 3, costUsd: 1.5, credits: 30, unpriced: 1 });
    const one = await modelMonthStats("f", "t", "b");
    expect(one.map((s) => s.modelId)).toEqual(["b"]);
  });
});

describe("updateAiModelRow", () => {
  it("writes the fields plus updated_by and updated_at", async () => {
    await updateAiModelRow("m1", { label: "New" }, "u9");
    const upd = calls.find((c) => c.op === "update")!;
    const written = upd.args[0] as Record<string, unknown>;
    expect(written.label).toBe("New");
    expect(written.updated_by).toBe("u9");
    expect(typeof written.updated_at).toBe("string");
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["id", "m1"]);
  });
});

describe("deleteAiModelPrice", () => {
  it("returns deleted false when the guard trigger refuses", async () => {
    results.ai_model_prices = { error: { message: "a price that has started cannot be deleted" } };
    expect(await deleteAiModelPrice("p1", "m1")).toEqual({ deleted: false });
  });
  it("rethrows other errors", async () => {
    results.ai_model_prices = { error: { message: "boom" } };
    await expect(deleteAiModelPrice("p1", "m1")).rejects.toThrow("boom");
  });
  it("returns deleted true on success", async () => {
    results.ai_model_prices = { data: [{ id: "p1" }] };
    expect(await deleteAiModelPrice("p1", "m1")).toEqual({ deleted: true });
    const eqs = calls.filter((c) => c.table === "ai_model_prices" && c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([["id", "p1"], ["model_id", "m1"]]);
  });
  it("returns deleted false when no row matches the model", async () => {
    results.ai_model_prices = { data: [] };
    expect(await deleteAiModelPrice("p1", "other")).toEqual({ deleted: false });
  });
});

describe("replaceAiModelPrice", () => {
  const row = {
    modelId: "m1", effectiveFrom: "2027-01-01T00:00:00.000Z", lines: [{ meter: "provider_unit" as const, unit_usd: 1 }],
    estimate: { x: 1 }, sourceUrl: null, note: "n",
  };
  it("deletes and inserts in one rpc call and returns the new id", async () => {
    rpcResult = { data: "new-id", error: null };
    expect(await replaceAiModelPrice("old", row, "u1")).toEqual({ replaced: true, id: "new-id" });
    expect(rpcCalls).toEqual([{
      fn: "replace_ai_model_price",
      args: {
        p_cancel_id: "old", p_model_id: "m1", p_effective_from: row.effectiveFrom, p_lines: row.lines,
        p_estimate: row.estimate, p_source_url: null, p_note: "n", p_created_by: "u1",
      },
    }]);
    expect(calls).toEqual([]);
  });
  it("answers replaced false when the row has started or is another model's", async () => {
    rpcResult = { data: null, error: { message: `P0001: ${REPLACE_STARTED_DB_MESSAGE}` } };
    expect(await replaceAiModelPrice("old", row, "u1")).toEqual({ replaced: false });
  });
  it("rethrows other errors", async () => {
    rpcResult = { data: null, error: { message: "duplicate key" } };
    await expect(replaceAiModelPrice("old", row, "u1")).rejects.toThrow("duplicate key");
  });
});

describe("reorderAiModels", () => {
  it("writes the order in one rpc call", async () => {
    await reorderAiModels("video", ["b", "a"], "u1");
    expect(rpcCalls).toEqual([{ fn: "reorder_ai_models", args: { p_kind: "video", p_ids: ["b", "a"], p_updated_by: "u1" } }]);
  });
  it("throws on a database error", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    await expect(reorderAiModels("video", ["a"], "u1")).rejects.toThrow("boom");
  });
});

describe("modelRunsByAgency", () => {
  it("calls the one grouped rpc and maps numeric strings", async () => {
    rpcResult = {
      data: [
        { model_id: "a", org_id: "o1", org_name: "Acme", runs: "4", cost_usd: "0.5", credits: "20" },
        { model_id: "b", org_id: "o2", org_name: "Bee", runs: 1, cost_usd: 0, credits: 0 },
      ],
      error: null,
    };
    const all = await modelRunsByAgency("f", "t");
    expect(rpcCalls[0]).toEqual({ fn: "ai_model_month_runs_by_org", args: { p_from: "f", p_to: "t" } });
    expect(all[0]).toEqual({ modelId: "a", orgId: "o1", orgName: "Acme", runs: 4, costUsd: 0.5, credits: 20 });
    expect((await modelRunsByAgency("f", "t", "b")).map((r) => r.orgId)).toEqual(["o2"]);
    expect(rpcCalls).toHaveLength(2);
    expect(calls).toEqual([]);
  });
  it("throws on a database error", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    await expect(modelRunsByAgency("f", "t")).rejects.toThrow("boom");
  });
});
