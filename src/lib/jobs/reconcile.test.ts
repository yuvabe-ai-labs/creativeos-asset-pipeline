import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; kind: string; trigger_run_id: string; created_at: string };

const db = vi.hoisted(() => ({
  live: [] as { id: string; kind: string; trigger_run_id: string; created_at: string }[],
  /** Jobs still live when their update runs; a job finished in between is not in it. */
  stillLive: new Set<string>(),
  updated: [] as { id: string; row: Record<string, unknown> }[],
}));

// A small stand-in for the query builder: one list read, then a conditional update per job.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => {
      let row: Record<string, unknown> | null = null;
      let id = "";
      const b = {
        select: () => (row ? Promise.resolve(update()) : b),
        in: () => b,
        not: () => b,
        lt: () => b,
        limit: async () => ({ data: db.live, error: null }),
        update: (r: Record<string, unknown>) => ((row = r), b),
        eq: (_k: string, v: string) => ((id = v), b),
      };
      const update = () => {
        if (!db.stillLive.has(id)) return { data: [], error: null };
        db.updated.push({ id, row: row! });
        return { data: [{ id }], error: null };
      };
      return b;
    },
  }),
}));

import { reconcileDeadJobs } from "./reconcile";

const NOW = new Date("2026-11-06T10:00:00Z");
const job = (id: string, minutesOld: number): Row => ({
  id,
  kind: "asset-import",
  trigger_run_id: `run-${id}`,
  created_at: new Date(NOW.getTime() - minutesOld * 60_000).toISOString(),
});

describe("reconcileDeadJobs", () => {
  beforeEach(() => {
    db.live = [];
    db.stillLive = new Set();
    db.updated = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fails a job whose run crashed or ended, and leaves a running one alone", async () => {
    db.live = [job("crashed", 20), job("running", 20), job("completed", 20)];
    db.stillLive = new Set(["crashed", "running", "completed"]);
    const status: Record<string, string> = { "run-crashed": "CRASHED", "run-running": "EXECUTING", "run-completed": "COMPLETED" };
    const result = await reconcileDeadJobs(async (runId) => status[runId], NOW);
    expect(result.failed.sort()).toEqual(["completed", "crashed"]);
    expect(db.updated[0].row).toMatchObject({ status: "failed", error: "This stopped before it finished. Try again." });
  });

  it("gives up on a run Trigger.dev no longer knows only once it is old", async () => {
    db.live = [job("young", 20), job("old", 60)];
    db.stillLive = new Set(["young", "old"]);
    const result = await reconcileDeadJobs(async () => null, NOW);
    expect(result.failed).toEqual(["old"]);
  });

  it("never fails a job when its run could not be read", async () => {
    db.live = [job("unknown", 60)];
    db.stillLive = new Set(["unknown"]);
    const result = await reconcileDeadJobs(async () => {
      throw new Error("Trigger.dev is down");
    }, NOW);
    expect(result.failed).toEqual([]);
    expect(db.updated).toEqual([]);
  });

  it("keeps the result of a job that finished between the read and the update", async () => {
    db.live = [job("just-finished", 20)];
    const result = await reconcileDeadJobs(async () => "COMPLETED", NOW);
    expect(result.failed).toEqual([]);
  });
});
