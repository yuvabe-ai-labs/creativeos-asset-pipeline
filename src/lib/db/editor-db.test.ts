import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { listIncomingEdges } from "./edges";
import { saveEditorEdit, getEditorEdit } from "./editor-edits";
import { getEditorGenerationLock } from "./generation-lock";
import { listMediaFacts, saveMediaFacts } from "./media-facts";

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

/** A select chain that records filters and resolves to `data`. */
function stubSelect(data: unknown) {
  const calls: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      calls[m] = args;
      return chain;
    };
  }
  chain.maybeSingle = async () => ({ data, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
  mockFrom.mockImplementation(() => chain);
  return calls;
}

describe("media facts", () => {
  it("makes no query for no urls", async () => {
    expect((await listMediaFacts([])).size).toBe(0);
    await saveMediaFacts([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("maps rows to facts", async () => {
    const calls = stubSelect([{ url: "u1", duration_seconds: 5.04, video: { fps: 24, frames: 121, width: 720, height: 1280 }, audio: null }]);
    const facts = await listMediaFacts(["u1", "u2"]);
    expect(calls.in).toEqual(["url", ["u1", "u2"]]);
    expect(facts.get("u1")).toEqual({ durationSeconds: 5.04, video: { fps: 24, frames: 121, width: 720, height: 1280 }, audio: null });
    expect(facts.has("u2")).toBe(false);
  });

  it("upserts measured facts in one call", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => ({ upsert }));
    await saveMediaFacts([{ url: "u1", facts: { durationSeconds: 5, video: null, audio: { channels: 2, sampleRate: 44100 } } }]);
    expect(upsert).toHaveBeenCalledWith([{ url: "u1", duration_seconds: 5, video: null, audio: { channels: 2, sampleRate: 44100 } }], { onConflict: "url" });
  });
});

describe("generation lock", () => {
  it.each([["editor", "editor"], ["dub", "dub"], [null, null]])("reads %s", async (data, want) => {
    mockRpc.mockResolvedValue({ data, error: null });
    expect(await getEditorGenerationLock("n1")).toBe(want);
    expect(mockRpc).toHaveBeenCalledWith("editor_generation_lock", { p_node_id: "n1" });
  });

  it("throws on an error instead of reading it as unlocked", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getEditorGenerationLock("n1")).rejects.toBeTruthy();
  });
});

describe("editor edits", () => {
  it("upserts on the node id", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => ({ upsert }));
    const doc = { v: 1 as const, shape: "9:16" as const, sources: [], pieces: [], captions: [] };
    await saveEditorEdit({ nodeId: "ed", canvasId: "cv", doc });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ node_id: "ed", canvas_id: "cv", doc }), { onConflict: "node_id" });
  });

  it("reads the canvas's edit", async () => {
    const calls = stubSelect({ node_id: "ed", doc: { v: 1 } });
    expect(await getEditorEdit("cv")).toEqual({ nodeId: "ed", doc: { v: 1 } });
    expect(calls.eq).toEqual(["canvas_id", "cv"]);
  });
});

describe("incoming edges", () => {
  it("lists an Editor's inputs oldest first", async () => {
    const calls = stubSelect([{ id: "e1", source_node_id: "a", created_at: "t1" }]);
    expect(await listIncomingEdges("ed")).toEqual([{ id: "e1", sourceNodeId: "a", createdAt: "t1" }]);
    expect(calls.eq).toEqual(["target_node_id", "ed"]);
    expect(calls.order).toEqual(["created_at", { ascending: true }]);
  });
});
