import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/** A chainable PostgREST stub: every builder method returns `this`, and the chain
 *  resolves to whatever `result` was queued for that table. */
function makeSupabase(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        const entry = { table, ops: [] as Array<[string, unknown[]]> };
        calls.push(entry);
        const builder: Record<string, unknown> = {};
        const record =
          (name: string) =>
          (...args: unknown[]) => {
            entry.ops.push([name, args]);
            return builder;
          };
        for (const m of ["select", "in", "lt", "order", "limit", "update", "eq"]) {
          builder[m] = record(m);
        }
        // Awaiting the builder resolves the queued result for this table.
        (builder as { then: unknown }).then = (
          resolve: (v: unknown) => unknown,
        ) => resolve(results[table] ?? { data: [], error: null });
        return builder;
      },
    },
  };
}

let supabase: ReturnType<typeof makeSupabase>;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => supabase.client,
}));

import { listArchivable, releaseStuckArchives } from "./moodboards";

describe("listArchivable", () => {
  beforeEach(() => vi.resetAllMocks());

  it("joins items to their client through the board", async () => {
    supabase = makeSupabase({
      moodboard_items: {
        data: [
          { id: "i1", moodboard_id: "b1" },
          { id: "i2", moodboard_id: "b2" },
        ],
        error: null,
      },
      moodboards: {
        data: [
          { id: "b1", client_id: "c1" },
          { id: "b2", client_id: "c2" },
        ],
        error: null,
      },
    });

    expect(await listArchivable(50, 4)).toEqual([
      { id: "i1", clientId: "c1" },
      { id: "i2", clientId: "c2" },
    ]);
  });

  it("selects only retryable rows, oldest first", async () => {
    supabase = makeSupabase({ moodboard_items: { data: [], error: null } });

    await listArchivable(50, 4);

    const ops = Object.fromEntries(supabase.calls[0].ops);
    expect(ops.in).toEqual(["archive_status", ["pending", "failed"]]);
    expect(ops.lt).toEqual(["archive_attempts", 4]);
    expect(ops.order).toEqual(["added_at", { ascending: true }]);
    expect(ops.limit).toEqual([50]);
  });

  // An empty first query must not fire a second one with an empty `in` list, which
  // PostgREST treats as "match nothing" but still costs a round trip.
  it("does not query boards when there is no work", async () => {
    supabase = makeSupabase({ moodboard_items: { data: [], error: null } });

    expect(await listArchivable(50, 4)).toEqual([]);
    expect(supabase.calls).toHaveLength(1);
  });

  // A board deleted between the two queries would otherwise produce an item with an
  // undefined client id, and the archive would write to `clients/undefined/...`.
  it("drops an item whose board has vanished", async () => {
    supabase = makeSupabase({
      moodboard_items: { data: [{ id: "i1", moodboard_id: "gone" }], error: null },
      moodboards: { data: [], error: null },
    });

    expect(await listArchivable(50, 4)).toEqual([]);
  });

  it("de-duplicates board ids before the second query", async () => {
    supabase = makeSupabase({
      moodboard_items: {
        data: [
          { id: "i1", moodboard_id: "b1" },
          { id: "i2", moodboard_id: "b1" },
        ],
        error: null,
      },
      moodboards: { data: [{ id: "b1", client_id: "c1" }], error: null },
    });

    await listArchivable(50, 4);

    const boardOps = Object.fromEntries(supabase.calls[1].ops);
    expect(boardOps.in).toEqual(["id", ["b1"]]);
  });

  it("propagates a query error", async () => {
    supabase = makeSupabase({
      moodboard_items: { data: null, error: new Error("connection lost") },
    });
    await expect(listArchivable(50, 4)).rejects.toThrow("connection lost");
  });
});

describe("releaseStuckArchives", () => {
  it("moves abandoned downloads back to failed and reports the count", async () => {
    supabase = makeSupabase({
      moodboard_items: { data: [{ id: "i1" }, { id: "i2" }], error: null },
    });

    expect(await releaseStuckArchives("2026-09-15T00:00:00Z")).toBe(2);

    const ops = Object.fromEntries(supabase.calls[0].ops);
    expect(ops.update).toEqual([
      { archive_status: "failed", archive_error: "abandoned mid-download" },
    ]);
    expect(ops.eq).toEqual(["archive_status", "downloading"]);
    expect(ops.lt).toEqual(["archive_started_at", "2026-09-15T00:00:00Z"]);
  });

  it("reports zero when nothing was stuck", async () => {
    supabase = makeSupabase({ moodboard_items: { data: [], error: null } });
    expect(await releaseStuckArchives("2026-09-15T00:00:00Z")).toBe(0);
  });
});
