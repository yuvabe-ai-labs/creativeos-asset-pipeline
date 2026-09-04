import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { setActiveVersion } from "./versions";

type Write = { table: string; values: Record<string, unknown>; eqCol: string; eqVal: string };

// Records every .from(t).update(v).eq(c, x) the call makes, in order.
function stubDb(opts?: { failOn?: string }) {
  const writes: Write[] = [];
  mockFrom.mockImplementation((table: string) => ({
    update: (values: Record<string, unknown>) => ({
      eq: async (eqCol: string, eqVal: string) => {
        writes.push({ table, values, eqCol, eqVal });
        return {
          error: opts?.failOn === table ? { message: `${table} write failed` } : null,
        };
      },
    }),
  }));
  return writes;
}

beforeEach(() => mockFrom.mockReset());

describe("setActiveVersion", () => {
  it("moves the active-version pointer on the node", async () => {
    const writes = stubDb();
    await setActiveVersion("node-1", "ver-2");

    const pointer = writes.find((w) => w.table === "nodes");
    expect(pointer).toEqual({
      table: "nodes",
      values: { active_version_id: "ver-2" },
      eqCol: "id",
      eqVal: "node-1",
    });
  });

  // D202. This second write looks redundant — it changes no state anyone reads — and that is
  // exactly why it is pinned here. The active-version POINTER lives on `nodes`, but the
  // on-canvas ApprovalBadge, the senior's queue counts and the maker's inbox all subscribe to
  // `node_versions` (D159/D179). Without touching the version row, a restore silently changes
  // which approval status is current and NO subscriber ever hears about it — TC-106/TC-107.
  // If this test fails because the write was removed as dead code, restore the write.
  it("bumps updated_at on the newly-active version, so the restore emits a realtime event", async () => {
    const writes = stubDb();
    await setActiveVersion("node-1", "ver-2");

    const ping = writes.find((w) => w.table === "node_versions");
    expect(ping, "setActiveVersion must touch node_versions — see D202").toBeDefined();
    expect(ping!.eqCol).toBe("id");
    expect(ping!.eqVal).toBe("ver-2"); // the version being made ACTIVE, not the node
    expect(typeof ping!.values.updated_at).toBe("string");
  });

  it("throws when the pointer move fails — nothing was restored", async () => {
    stubDb({ failOn: "nodes" });
    await expect(setActiveVersion("node-1", "ver-2")).rejects.toBeDefined();
  });

  // Liveness, not correctness: the pointer has already moved, so the restore SUCCEEDED. Other
  // clients just find out on their next load instead of immediately. Throwing here would report
  // a completed restore as a failure and invite the user to retry something already done.
  it("does not throw when only the realtime bump fails", async () => {
    stubDb({ failOn: "node_versions" });
    await expect(setActiveVersion("node-1", "ver-2")).resolves.toBeUndefined();
  });
});
