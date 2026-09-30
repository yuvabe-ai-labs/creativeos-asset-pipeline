import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { getAvatar, updateAvatar, archiveAvatar } from "./avatars";

beforeEach(() => mockFrom.mockReset());

// Postgres throws on a non-UUID id; getAvatar/updateAvatar/archiveAvatar treat a malformed id
// as "not found" without ever querying — see the guard comment in ./avatars.ts.
describe("malformed id guard", () => {
  it("getAvatar resolves null for a non-UUID id, without querying", async () => {
    await expect(getAvatar("c1", "abc")).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("updateAvatar resolves null for a non-UUID id, without querying", async () => {
    await expect(updateAvatar("c1", "abc", {})).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("archiveAvatar resolves false for a non-UUID id, without querying", async () => {
    await expect(archiveAvatar("c1", "abc")).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
