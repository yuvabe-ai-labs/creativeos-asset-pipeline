import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

type Result = { data?: unknown; error?: { message: string } | null };
const calls: { table: string; op: string; args: unknown[] }[] = [];
const results: Record<string, Result> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
  for (const op of ["select", "order", "eq", "in", "insert", "delete", "single"]) b[op] = chain(op);
  b.then = (resolve: (v: Result) => unknown) => resolve({ error: null, ...(results[table] ?? { data: [] }) });
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: (t: string) => builder(t) }) }));

import { listAdminCreditSettings, insertCreditSettings, deleteCreditSettings, CREDIT_SETTINGS_STARTED_DB_MESSAGE } from "../credit-settings-admin";

const row = (id: string, by: string | null, over: Record<string, unknown> = {}) => ({
  id, effective_from: "2026-01-01T00:00:00Z", margin_percent: "0.00", round_step: 5, note: null,
  created_at: "2026-01-01T00:00:00Z", created_by: by, ...over,
});

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
});

describe("listAdminCreditSettings", () => {
  it("maps created_by to a name with one profiles query and keeps broken rows", async () => {
    results.credit_settings = { data: [row("a", "u1"), row("b", "u1"), row("c", null, { round_step: 7 })] };
    results.profiles = { data: [{ id: "u1", display_name: "Asha" }] };
    const rows = await listAdminCreditSettings();
    expect(rows.map((r) => r.createdByName)).toEqual(["Asha", "Asha", null]);
    expect(rows[0].settings).toMatchObject({ id: "a", marginPercent: 0, roundStep: 5 });
    expect(rows[2].settings).toBeNull();
    expect(rows[2].problems.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.table === "profiles" && c.op === "in")).toHaveLength(1);
  });
});

describe("insertCreditSettings", () => {
  it("inserts the row with created_by and returns its id", async () => {
    results.credit_settings = { data: { id: "n1" } };
    expect(await insertCreditSettings({ effectiveFrom: "2026-08-01T00:00:00.000Z", marginPercent: 20, roundStep: 10, note: "n" }, "u1")).toEqual({ id: "n1" });
    expect(calls.find((c) => c.op === "insert")?.args[0]).toEqual({
      effective_from: "2026-08-01T00:00:00.000Z", margin_percent: 20, round_step: 10, note: "n", created_by: "u1",
    });
    expect(calls.filter((c) => c.table === "credit_settings").map((c) => c.op)).toEqual(["insert", "select", "single"]);
    expect(calls.find((c) => c.op === "select")?.args[0]).toBe("id");
  });
  it("throws a database error", async () => {
    results.credit_settings = { error: { message: "boom" } };
    await expect(insertCreditSettings({ effectiveFrom: "x", marginPercent: 0, roundStep: 1, note: null }, "u1")).rejects.toThrow("boom");
  });
});

describe("deleteCreditSettings", () => {
  it("deletes by id and reports a match", async () => {
    results.credit_settings = { data: [{ id: "a" }] };
    expect(await deleteCreditSettings("a")).toEqual({ deleted: true });
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["id", "a"]);
  });
  it("reports no match", async () => {
    results.credit_settings = { data: [] };
    expect(await deleteCreditSettings("a")).toEqual({ deleted: false });
  });
  it("treats the started-row trigger as not deleted", async () => {
    results.credit_settings = { error: { message: `P0001: ${CREDIT_SETTINGS_STARTED_DB_MESSAGE}` } };
    expect(await deleteCreditSettings("a")).toEqual({ deleted: false });
  });
  it("throws any other database error", async () => {
    results.credit_settings = { error: { message: "boom" } };
    await expect(deleteCreditSettings("a")).rejects.toThrow("boom");
  });
});
