import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ops: Array<[string, unknown[]]> = [];
let result: { data?: unknown; error?: unknown; count?: number | null } = { data: null, error: null, count: 0 };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from(table: string) {
      ops.push(["from", [table]]);
      const builder: Record<string, unknown> = {};
      for (const m of ["delete", "lt"]) builder[m] = (...args: unknown[]) => { ops.push([m, args]); return builder; };
      (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
      return builder;
    },
  }),
}));

import { deleteTurnTracesBefore } from "../copilot-traces";

describe("deleteTurnTracesBefore", () => {
  it("deletes traces created before the cutoff and reports how many", async () => {
    result = { data: null, error: null, count: 7 };
    expect(await deleteTurnTracesBefore("2026-10-20T00:00:00.000Z")).toBe(7);
    expect(ops).toEqual([
      ["from", ["copilot_turn_traces"]],
      ["delete", [{ count: "exact" }]],
      ["lt", ["created_at", "2026-10-20T00:00:00.000Z"]],
    ]);
  });

  it("throws when the delete fails", async () => {
    result = { data: null, error: new Error("down"), count: null };
    await expect(deleteTurnTracesBefore("2026-10-20T00:00:00.000Z")).rejects.toThrow("down");
  });
});
