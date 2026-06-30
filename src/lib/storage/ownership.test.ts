import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { resolveOwnership } from "./ownership";

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockMaybeSingle.mockReset();
});

describe("resolveOwnership", () => {
  it("returns clientId + canvasId from a node JOIN", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { canvas_id: "ca1", canvases: { client_id: "c1" } },
      error: null,
    });
    const result = await resolveOwnership("n1");
    expect(result).toEqual({ clientId: "c1", canvasId: "ca1" });
    expect(mockFrom).toHaveBeenCalledWith("nodes");
    expect(mockSelect).toHaveBeenCalledWith("canvas_id, canvases(client_id)");
    expect(mockEq).toHaveBeenCalledWith("id", "n1");
  });

  it("throws when the node row is missing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveOwnership("missing")).rejects.toThrow(
      "Node missing not found.",
    );
  });

  it("throws when Supabase returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(resolveOwnership("n1")).rejects.toThrow("boom");
  });
});
