import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// A second id (from the URL or the body) is tied to the client or board the route checked,
// in the query itself. A recording stand-in for the query builder logs every call; awaiting the
// chain resolves to the next queued result.
const { calls, results } = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  results: [] as Array<{ data: unknown; error: unknown }>,
}));
vi.mock("@/lib/supabase/server", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "in", "insert", "update", "delete", "single", "maybeSingle", "order"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(results.shift() ?? { data: [], error: null });
  return { createServerSupabase: () => chain };
});

import { createSignal, deleteSignal, updateSignal } from "./signals";
import { removeItem } from "./moodboards";

const eqs = () => calls.filter(([m]) => m === "eq").map(([, a]) => a);
const did = (m: string) => calls.some(([name]) => name === m);

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
});

describe("signals are scoped to the checked client", () => {
  it("updateSignal filters by client and reports no match as false", async () => {
    results.push({ data: [], error: null });
    expect(await updateSignal("client-a", "sig-b", { name: "x" })).toBe(false);
    expect(eqs()).toEqual(expect.arrayContaining([["id", "sig-b"], ["client_id", "client-a"]]));
  });

  it("deleteSignal filters by client and reports a match as true", async () => {
    results.push({ data: [{ id: "sig-a" }], error: null });
    expect(await deleteSignal("client-a", "sig-a")).toBe(true);
    expect(eqs()).toEqual(expect.arrayContaining([["id", "sig-a"], ["client_id", "client-a"]]));
  });

  it("createSignal links only this client's items: another client's item writes nothing", async () => {
    // The ownership read finds one of the two ids on this client's boards.
    results.push({ data: [{ id: "item-a" }], error: null });
    expect(
      await createSignal("client-a", { name: "n", tags: [], description: "", itemIds: ["item-a", "item-b"] }),
    ).toBeNull();
    expect(eqs()).toContainEqual(["moodboards.client_id", "client-a"]);
    expect(did("insert")).toBe(false);
  });
});

describe("moodboard items are scoped to the checked board", () => {
  it("removeItem filters by board", async () => {
    results.push({ data: [], error: null });
    await removeItem("board-a", "item-b");
    expect(eqs()).toEqual(expect.arrayContaining([["id", "item-b"], ["moodboard_id", "board-a"]]));
  });
});
