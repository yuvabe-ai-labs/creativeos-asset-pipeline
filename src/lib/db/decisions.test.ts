import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { getDecisionsByVersionIds, type DecisionRow } from "./decisions";

function row(over: Partial<DecisionRow>): DecisionRow {
  return {
    id: "d1",
    version_id: "v1",
    org_id: "org-1",
    status: "approved",
    note: null,
    decided_by_user_id: "senior-1",
    decided_at: "2026-08-24T10:00:00Z",
    ...over,
  };
}

// The query is `.select(...).in(...).order(...)` — the DB returns rows already sorted
// newest-first, so the stub hands back whatever order the test declares.
function stubDb(rows: DecisionRow[]) {
  const seen: { versionIds?: string[] } = {};
  mockFrom.mockImplementation(() => ({
    select: () => ({
      in: (_col: string, ids: string[]) => {
        seen.versionIds = ids;
        return {
          order: async () => ({ data: rows, error: null }),
        };
      },
    }),
  }));
  return seen;
}

beforeEach(() => mockFrom.mockReset());

describe("getDecisionsByVersionIds", () => {
  it("returns an empty map for no ids, without querying at all", async () => {
    const out = await getDecisionsByVersionIds([]);
    expect(out.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // D173's whole point: a version that was rejected and later approved must keep BOTH
  // entries. Overwriting instead of accumulating would silently reduce the log to "latest
  // decision only" — exactly the bug this table exists to fix.
  it("accumulates every decision on one version, newest first", async () => {
    stubDb([
      row({ id: "d2", version_id: "v1", status: "approved", decided_at: "2026-08-24T12:00:00Z" }),
      row({
        id: "d1",
        version_id: "v1",
        status: "changes_requested",
        note: "change the logo",
        decided_at: "2026-08-24T11:00:00Z",
      }),
    ]);

    const out = await getDecisionsByVersionIds(["v1"]);
    const v1 = out.get("v1");

    expect(v1?.map((d) => d.id)).toEqual(["d2", "d1"]);
    expect(v1?.map((d) => d.status)).toEqual(["approved", "changes_requested"]);
    // The rejection's note survives the later approval.
    expect(v1?.[1].note).toBe("change the logo");
  });

  it("groups decisions under the version they belong to, never mixing them", async () => {
    stubDb([
      row({ id: "d3", version_id: "v2", status: "approved" }),
      row({ id: "d2", version_id: "v1", status: "approved" }),
      row({ id: "d1", version_id: "v1", status: "changes_requested" }),
    ]);

    const out = await getDecisionsByVersionIds(["v1", "v2"]);

    expect(out.get("v1")?.map((d) => d.id)).toEqual(["d2", "d1"]);
    expect(out.get("v2")?.map((d) => d.id)).toEqual(["d3"]);
  });

  it("omits a version that has no decisions rather than mapping it to an empty array", async () => {
    stubDb([row({ id: "d1", version_id: "v1" })]);
    const out = await getDecisionsByVersionIds(["v1", "v2"]);
    // Callers use `?? []`, so absence and emptiness read the same downstream — this pins
    // which one the map actually contains.
    expect(out.has("v2")).toBe(false);
  });

  it("queries for exactly the version ids it was given", async () => {
    const seen = stubDb([]);
    await getDecisionsByVersionIds(["v1", "v2", "v3"]);
    expect(seen.versionIds).toEqual(["v1", "v2", "v3"]);
  });

  it("throws when the query fails, rather than returning a silently empty history", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: async () => ({ data: null, error: new Error("db down") }),
        }),
      }),
    }));
    await expect(getDecisionsByVersionIds(["v1"])).rejects.toThrow(/db down/);
  });
});
