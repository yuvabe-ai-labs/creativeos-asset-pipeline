import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

// Every call made on the query chain, in order. The chain resolves to an empty result.
const calls: [string, ...unknown[]][] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "in", "gte", "ilike", "order", "range", "limit"]) {
      chain[m] = (...args: unknown[]) => (calls.push([m, ...args]), chain);
    }
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], count: 0, error: null });
    return chain;
  },
}));
vi.mock("../credit-transactions", () => ({ getReservationAmounts: async () => new Map() }));

import {
  countGenerationsForOrg,
  listAvatarGenerations,
  listGenerationsForOrgPage,
  listGenerationsInWindowForOrg,
} from "../generations";

beforeEach(() => {
  calls.length = 0;
});

const recordOnlyFilter = ["eq", "record_only", false];

describe("generations readers and record-only rows (D537)", () => {
  it("the admin org count leaves record-only rows out", async () => {
    await countGenerationsForOrg("o");
    expect(calls).toContainEqual(recordOnlyFilter);
  });

  it("the admin org list leaves record-only rows out", async () => {
    await listGenerationsForOrgPage("o", { page: 1, pageSize: 10, query: "gpt" });
    expect(calls).toContainEqual(recordOnlyFilter);
  });

  it("an avatar's generations leave record-only rows out", async () => {
    await listAvatarGenerations("00000000-0000-4000-8000-000000000000");
    expect(calls).toContainEqual(recordOnlyFilter);
  });

  it("the impersonation audit keeps every row, record-only ones included", async () => {
    await listGenerationsInWindowForOrg("o", "2026-11-23T00:00:00Z");
    expect(calls.some(([m, col]) => m === "eq" && col === "record_only")).toBe(false);
  });
});
