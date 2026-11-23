import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ops: Array<[string, unknown[]]> = [];
let result: { data?: unknown; error?: unknown } = { data: [], error: null };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from(table: string) {
      ops.push(["from", [table]]);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) builder[m] = (...args: unknown[]) => { ops.push([m, args]); return builder; };
      (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
      return builder;
    },
  }),
}));

import { listPendingChangeCards } from "../copilot-messages";

const card = {
  kind: "change", versionId: "v1", status: "pending", decision: null,
  fields: [{ path: "image_analysis.aesthetic", label: "A", before: "x", after: "y", from: "Image study", docId: null }],
};

describe("listPendingChangeCards", () => {
  it("lists the pending change cards of the onboarding thread with their ids", async () => {
    result = { data: [{ id: "m1", card }, { id: "m2", card: { kind: "change", nonsense: true } }], error: null };
    expect(await listPendingChangeCards("c1")).toEqual([{ id: "m1", card }]);
    expect(ops).toEqual([
      ["from", ["client_copilot_messages"]],
      ["select", ["id, card"]],
      ["eq", ["client_id", "c1"]],
      ["eq", ["thread", "onboarding"]],
      ["eq", ["card->>kind", "change"]],
      ["eq", ["card->>status", "pending"]],
    ]);
  });

  it("throws when the read fails: never 'nothing is waiting'", async () => {
    result = { data: null, error: new Error("down") };
    await expect(listPendingChangeCards("c1")).rejects.toThrow("down");
  });
});
