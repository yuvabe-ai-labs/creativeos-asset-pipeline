import { describe, it, expect } from "vitest";
import { toReviewComment, type ReviewCommentRow } from "./wire";

const row: ReviewCommentRow = {
  id: "c1",
  review_id: "r1",
  author_name: "Priya",
  body: "Logo too small",
  timecode_ms: 4000,
  edited_by_name: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

describe("toReviewComment", () => {
  it("maps a row to the wire shape without the review id", () => {
    expect(toReviewComment(row)).toEqual({
      id: "c1",
      authorName: "Priya",
      body: "Logo too small",
      timecodeMs: 4000,
      editedByName: null,
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
    });
    expect(toReviewComment(row)).not.toHaveProperty("reviewId");
  });
});
