import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: mockRpc, from: mockFrom }) }));

import { deleteScript, listScriptDeleteBlocks } from "./scripts";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";

/** A read chain that records its calls and resolves to `result` when awaited. */
function read(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not"]) {
    c[m] = vi.fn((...args: unknown[]) => { calls.push([m, ...args]); return c; });
  }
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return { c, calls };
}

beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); });

describe("deleteScript", () => {
  it.each(["deleted", "not_found", "has_canvas", "shared", "drawing"])("returns %s as the database decided it", async (status) => {
    mockRpc.mockResolvedValue({ data: status, error: null });
    expect(await deleteScript("c1", SCRIPT_ID)).toBe(status);
    expect(mockRpc).toHaveBeenCalledWith("delete_client_script", { p_client_id: "c1", p_script_id: SCRIPT_ID });
  });

  it("is not_found for a malformed id, without asking the database", async () => {
    expect(await deleteScript("c1", "not-a-uuid")).toBe("not_found");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("throws on a database error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(deleteScript("c1", SCRIPT_ID)).rejects.toThrow("boom");
  });

  it("throws on an answer it does not know", async () => {
    mockRpc.mockResolvedValue({ data: "weird", error: null });
    await expect(deleteScript("c1", SCRIPT_ID)).rejects.toThrow(/Unexpected delete result/);
  });
});

describe("listScriptDeleteBlocks", () => {
  it("names each blocked script once, a canvas before a share", async () => {
    const canvases = read({ data: [{ source_script_id: "a" }], error: null });
    const reviews = read({ data: [{ script_id: "a" }, { script_id: "b" }], error: null });
    mockFrom.mockImplementation((table: string) => (table === "canvases" ? canvases.c : reviews.c));
    expect(await listScriptDeleteBlocks("c1")).toEqual({ a: "has_canvas", b: "shared" });
    expect(canvases.calls).toContainEqual(["eq", "client_id", "c1"]);
    expect(canvases.calls).toContainEqual(["not", "source_script_id", "is", null]);
    expect(reviews.calls).toContainEqual(["eq", "client_id", "c1"]);
  });

  it("gives no blocks, without throwing, when a read fails (the server still refuses)", async () => {
    const canvases = read({ data: null, error: new Error("down") });
    const reviews = read({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => (table === "canvases" ? canvases.c : reviews.c));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listScriptDeleteBlocks("c1")).toEqual({});
  });
});
