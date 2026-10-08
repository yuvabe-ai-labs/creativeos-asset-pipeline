import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));
vi.mock("./credit-transactions", () => ({ getReservationAmounts: vi.fn() }));

import { getAvatarGeneration, insertGeneration } from "./generations";

beforeEach(() => {
  mockFrom.mockReset();
  insert.mockReset();
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "g1" }, error: null }) }) });
  mockFrom.mockReturnValue({ insert });
});

describe("insertGeneration", () => {
  it("writes an avatar-owned row with no node", async () => {
    await insertGeneration({ avatarId: "a1", orgId: "org-1", clientId: "c1", type: "image" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ node_id: null, avatar_id: "a1", client_id: "c1", type: "image" }),
    );
  });

  it("still writes a node-owned row with no avatar", async () => {
    await insertGeneration({ nodeId: "n1", orgId: "org-1", type: "image" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ node_id: "n1", avatar_id: null }));
  });

  it("refuses a generation owned by nothing", async () => {
    await expect(insertGeneration({ orgId: "org-1", type: "image" })).rejects.toThrow(/node or an avatar/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("getAvatarGeneration", () => {
  it("resolves null for a malformed id without querying", async () => {
    mockFrom.mockReset();
    await expect(getAvatarGeneration("a1", "abc")).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
