import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; client_id: string | null; kind: string; input: unknown; trigger_run_id: string; created_at: string };

const db = vi.hoisted(() => ({
  live: [] as Row[],
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
      let rows = db.live;
      const b = {
        select: () => (row ? Promise.resolve(update()) : b),
        in: () => b,
        not: () => b,
        // Applied for real, so a test sees which jobs the sweep reads at all.
        lt: (_k: string, iso: string) => ((rows = rows.filter((r) => r.created_at < iso)), b),
        limit: async () => ({ data: rows, error: null }),
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
  client_id: "client-1",
  kind: "asset-import",
  input: { source: "instagram" },
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

  it("fails a job whose run has already ended, however young the job is", async () => {
    // A run that fails before its code loads (Trigger.dev's own error) never marks its job: the
    // panel said "Studying the images…" for a study that had stopped two seconds in.
    db.live = [job("died", 2)];
    db.stillLive = new Set(["died"]);
    const result = await reconcileDeadJobs(async () => "SYSTEM_FAILURE", NOW);
    expect(result.failed).toEqual(["died"]);
  });

  it("hands each job it failed, and only those, to be said in the thread (D506)", async () => {
    db.live = [job("crashed", 20), job("running", 20), job("just-finished", 20)];
    db.stillLive = new Set(["crashed", "running"]);
    const status: Record<string, string> = { "run-crashed": "CRASHED", "run-running": "EXECUTING", "run-just-finished": "COMPLETED" };
    const said: unknown[] = [];
    await reconcileDeadJobs(async (runId) => status[runId], NOW, async (j) => { said.push(j); });
    expect(said).toEqual([{ client_id: "client-1", kind: "asset-import", input: { source: "instagram" } }]);
  });

  it("keeps sweeping when saying one failure goes wrong", async () => {
    db.live = [job("a", 20), job("b", 20)];
    db.stillLive = new Set(["a", "b"]);
    const result = await reconcileDeadJobs(async () => "CRASHED", NOW, async () => { throw new Error("db down"); });
    expect(result.failed.sort()).toEqual(["a", "b"]);
  });

  it("leaves a young job alone while its run is still waiting to start", async () => {
    db.live = [job("waiting", 2)];
    db.stillLive = new Set(["waiting"]);
    const result = await reconcileDeadJobs(async () => "QUEUED", NOW);
    expect(result.failed).toEqual([]);
  });
});
