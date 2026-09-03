import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import {
  insertAnnotations,
  getAnnotationsByDecisionIds,
  type AnnotationRow,
} from "./annotations";

function row(over: Partial<AnnotationRow>): AnnotationRow {
  return {
    id: "a1",
    decision_id: "d1",
    org_id: "org-1",
    seq: 1,
    kind: "image",
    timecode_ms: null,
    frame_path: null,
    mask_path: "org-1/d1/1-mask.png",
    note: "logo too small",
    created_at: "2026-09-03T10:00:00Z",
    ...over,
  };
}

beforeEach(() => mockFrom.mockReset());

describe("insertAnnotations", () => {
  it("does not query at all for an empty batch", async () => {
    await insertAnnotations([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("inserts the whole batch in one call and throws on error", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => ({ insert }));
    const { id: _i, created_at: _c, ...one } = row({});
    await insertAnnotations([one]);
    expect(mockFrom).toHaveBeenCalledWith("node_version_annotations");
    expect(insert).toHaveBeenCalledWith([one]);

    mockFrom.mockImplementation(() => ({
      insert: async () => ({ error: new Error("db down") }),
    }));
    await expect(insertAnnotations([one])).rejects.toThrow(/db down/);
  });
});

describe("getAnnotationsByDecisionIds", () => {
  it("returns an empty map for no ids, without querying", async () => {
    const out = await getAnnotationsByDecisionIds([]);
    expect(out.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("groups rows under their decision id in pin order", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: () => ({
            order: async () => ({
              data: [
                row({ id: "a1", decision_id: "d1", seq: 1 }),
                row({ id: "a2", decision_id: "d1", seq: 2, note: "second" }),
                row({ id: "a3", decision_id: "d2", seq: 1 }),
              ],
              error: null,
            }),
          }),
        }),
      }),
    }));
    const out = await getAnnotationsByDecisionIds(["d1", "d2"]);
    expect(out.get("d1")?.map((a) => a.seq)).toEqual([1, 2]);
    expect(out.get("d2")?.map((a) => a.id)).toEqual(["a3"]);
    expect(out.has("d3")).toBe(false);
  });

  it("throws when the query fails", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: () => ({
            order: async () => ({ data: null, error: new Error("db down") }),
          }),
        }),
      }),
    }));
    await expect(getAnnotationsByDecisionIds(["d1"])).rejects.toThrow(/db down/);
  });
});
