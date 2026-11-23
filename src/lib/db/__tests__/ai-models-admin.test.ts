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
    expect(await deleteAiModelPrice("p1")).toEqual({ deleted: false });
  });
  it("rethrows other errors", async () => {
    results.ai_model_prices = { error: { message: "boom" } };
    await expect(deleteAiModelPrice("p1")).rejects.toThrow("boom");
  });
  it("returns deleted true on success", async () => {
    results.ai_model_prices = { data: [{ id: "p1" }] };
    expect(await deleteAiModelPrice("p1")).toEqual({ deleted: true });
  });
});
