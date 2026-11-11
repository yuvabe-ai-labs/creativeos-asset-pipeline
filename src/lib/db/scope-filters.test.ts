import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// A recording stand-in for the query builder: every filter call is logged, and awaiting the
// chain (or calling rpc) resolves to `result`.
const { calls, state } = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  state: { result: { data: [] as unknown, error: null as unknown } },
}));
vi.mock("@/lib/supabase/server", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "in", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(state.result);
  chain.rpc = async (...args: unknown[]) => {
    calls.push(["rpc", args]);
    return state.result;
  };
  return { createServerSupabase: () => chain };
});
vi.mock("./profiles", () => ({ resolveDisplayNames: vi.fn(async () => new Map()) }));

import { listRecentCanvases } from "./canvases";
import { getOrgReviewCounts } from "./review";
import { listClientsWithMoodboards } from "./moodboards";

const inCalls = () => calls.filter(([m]) => m === "in");

beforeEach(() => {
  calls.length = 0;
  state.result = { data: [], error: null };
});

describe("listRecentCanvases", () => {
  it("keeps to the person's clients when they have a list", async () => {
    await listRecentCanvases("org-1", ["c1", "c2"]);
    expect(inCalls()).toEqual([["in", ["client_id", ["c1", "c2"]]]]);
  });

  it("does not filter by client for someone on all clients", async () => {
    await listRecentCanvases("org-1", null);
    expect(inCalls()).toEqual([]);
    expect(calls).toContainEqual(["eq", ["clients.org_id", "org-1"]]);
  });
});

describe("getOrgReviewCounts", () => {
  const rows = [
    { client_id: "c1", canvas_id: "cv1", pending: 2 },
    { client_id: "c2", canvas_id: "cv2", pending: 5 },
  ];

  it("counts only the person's clients when they have a list", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", ["c1"]);
    expect(counts.byClient).toEqual({ c1: 2 });
    expect(counts.byCanvas).toEqual({ cv1: 2 });
  });

  it("counts every client for someone on all clients", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", null);
    expect(counts.byClient).toEqual({ c1: 2, c2: 5 });
  });
});

describe("listClientsWithMoodboards", () => {
  it("keeps to the person's clients when they have a list", async () => {
    await listClientsWithMoodboards("org-1", ["c1"]);
    expect(inCalls()).toEqual([["in", ["id", ["c1"]]]]);
  });

  it("does not filter by client for someone on all clients", async () => {
    await listClientsWithMoodboards("org-1", null);
    expect(inCalls()).toEqual([]);
  });
});
