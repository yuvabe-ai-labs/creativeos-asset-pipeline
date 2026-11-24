import { beforeEach, describe, expect, it, vi } from "vitest";

// D530: the market agent reads references by id (only this client's), checks what is already saved
// before fetching, and keeps its reading of a post on the item.

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
let calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "update", "order", "limit"]) {
    c[m] = (...args: unknown[]) => { calls.push([m, ...args]); return c; };
  }
  c.then = (resolve: (r: unknown) => unknown) => resolve(result);
  return c;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: (table: string) => { calls.push(["from", table]); return chain(); } }),
}));

import { listBucketUrls, listItemsByIds, setItemReading } from "../moodboards";
import { listSignalNames } from "../signals";

beforeEach(() => { calls = []; result = { data: [], error: null }; });

describe("listItemsByIds", () => {
  it("reads only items on the client's own boards", async () => {
    result = { data: [{ id: "i1", image_url: "u", moodboards: { client_id: "c1" } }], error: null };
    const items = await listItemsByIds("c1", ["i1", "i1", "i2"]);
    expect(calls).toContainEqual(["in", "id", ["i1", "i2"]]);
    expect(calls).toContainEqual(["eq", "moodboards.client_id", "c1"]);
    expect(items).toEqual([{ id: "i1", image_url: "u" }]);
  });

  it("asks nothing for no ids", async () => {
    expect(await listItemsByIds("c1", [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("throws when the read fails, never 'none'", async () => {
    result = { data: null, error: new Error("down") };
    await expect(listItemsByIds("c1", ["i1"])).rejects.toThrow("down");
  });
});

describe("listBucketUrls", () => {
  it("returns every url in Direct and Adjacent", async () => {
    result = { data: [{ image_url: "https://instagram.com/p/A/" }, { image_url: "https://instagram.com/p/B/" }], error: null };
    const urls = await listBucketUrls("c1");
    expect(calls).toContainEqual(["in", "moodboards.board_type", ["direct", "adjacent"]]);
    expect(calls).toContainEqual(["eq", "moodboards.client_id", "c1"]);
    expect([...urls]).toEqual(["https://instagram.com/p/A/", "https://instagram.com/p/B/"]);
  });
});

describe("setItemReading", () => {
  it("writes the reading on the one item", async () => {
    const reading = { handle: "x", caption: "", hook: "h", format: "f", pacing: "p", onScreenText: "", setting: "", occasion: "", summary: "s", from: "media" as const };
    await setItemReading("i1", reading);
    expect(calls).toContainEqual(["update", { reading }]);
    expect(calls).toContainEqual(["eq", "id", "i1"]);
  });
});

describe("listSignalNames", () => {
  it("reads ids and names only, newest first", async () => {
    result = { data: [{ id: "s1", name: "Monsoon rituals" }], error: null };
    expect(await listSignalNames("c1")).toEqual([{ id: "s1", name: "Monsoon rituals" }]);
    expect(calls).toContainEqual(["select", "id, name"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });
});
