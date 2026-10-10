import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { countComments, updateComment } from "./client-reviews";

const row = {
  id: "c1", review_id: "r1", author_name: "Priya", body: "Warmer",
  timecode_ms: 4000, edited_by_name: "Arjun", created_at: "t1", updated_at: "t2",
};

// `.update(...).eq(...).eq(...).select(...).maybeSingle()` — records every eq filter
// so the test can assert the ownership check, and answers like the DB would: a row
// only when BOTH filters match the stored comment.
function stubUpdate(stored: { id: string; review_id: string } | null) {
  const filters: Record<string, string> = {};
  const chain = {
    eq: (col: string, value: string) => {
      filters[col] = value;
      return chain;
    },
    select: () => chain,
    maybeSingle: async () => ({
      data:
        stored && filters.id === stored.id && filters.review_id === stored.review_id
          ? row
          : null,
      error: null,
    }),
  };
  mockFrom.mockImplementation(() => ({ update: () => chain }));
  return filters;
}

beforeEach(() => mockFrom.mockReset());

describe("updateComment", () => {
  it("filters on both the comment id and the review id", async () => {
    const filters = stubUpdate({ id: "c1", review_id: "r1" });
    const out = await updateComment({ reviewId: "r1", commentId: "c1", body: "Warmer", editedByName: "Arjun" });
    expect(filters).toEqual({ id: "c1", review_id: "r1" });
    expect(out).toEqual(row);
  });

  it("returns null when the comment belongs to another review", async () => {
    stubUpdate({ id: "c1", review_id: "other-review" });
    const out = await updateComment({ reviewId: "r1", commentId: "c1", body: "x", editedByName: "A" });
    expect(out).toBeNull();
  });
});

describe("countComments", () => {
  it("asks for a head-only exact count scoped to the review", async () => {
    const select = vi.fn(() => ({
      eq: async (col: string, value: string) => {
        expect([col, value]).toEqual(["review_id", "r1"]);
        return { count: 7, error: null };
      },
    }));
    mockFrom.mockImplementation(() => ({ select }));
    expect(await countComments("r1")).toBe(7);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });
});
