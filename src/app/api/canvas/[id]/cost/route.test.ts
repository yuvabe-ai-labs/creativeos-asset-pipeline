import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withCanvas: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("cv1", { id: "cv1", client_id: "cl1" }),
  };
});

// Records each table's query chain; nodes answer one node, generations answer one charged row.
const calls: Record<string, [string, ...unknown[]][]> = {};
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      const log: [string, ...unknown[]][] = (calls[table] = []);
      const result = table === "nodes"
        ? { data: [{ id: "n1" }], error: null }
        : { data: [{ node_id: "n1", credits_charged: 4 }], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = (...a: unknown[]) => (log.push([m, ...a]), chain);
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return chain;
    },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
});

describe("GET /api/canvas/[id]/cost", () => {
  it("tallies settled jobs only, leaving record-only rows (D537) out", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "cv1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalCredits: 4, byNode: { n1: 4 } });
    expect(calls.generations).toContainEqual(["eq", "record_only", false]);
  });
});
