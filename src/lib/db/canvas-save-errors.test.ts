import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// The upserts' error (e.g. migration 0062's nodes_keep_canvas / edges_keep_canvas refusing a
// row from another canvas) must reach the caller, not be swallowed.
const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ upsert: upsertMock }) }),
}));
vi.mock("./kb", () => ({ getActiveKBVersion: vi.fn() }));

import { saveCanvasNodes } from "./nodes";
import { saveCanvasEdges } from "./edges";

const refusal = { code: "23514", message: "A node cannot move to another canvas" };

describe("canvas save upserts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saveCanvasNodes throws the database's refusal", async () => {
    upsertMock.mockResolvedValue({ error: refusal });
    await expect(
      saveCanvasNodes("cv-1", [{ id: "n-foreign", type: "text", position: { x: 0, y: 0 }, data: {} }]),
    ).rejects.toBe(refusal);
    expect(upsertMock.mock.calls[0][0]).toEqual([expect.objectContaining({ id: "n-foreign", canvas_id: "cv-1" })]);
  });

  it("saveCanvasEdges throws the database's refusal", async () => {
    upsertMock.mockResolvedValue({ error: refusal });
    await expect(saveCanvasEdges("cv-1", [{ id: "e1", source: "n-foreign", target: "n2" }])).rejects.toBe(refusal);
  });
});
