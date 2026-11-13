import { describe, it, expect } from "vitest";
import { toReviewComment, type ReviewCommentRow } from "./wire";

const row: ReviewCommentRow = {
  id: "c1",
  review_id: "r1",
  version_id: "v1",
  author_name: "Priya",
  body: "Logo too small",
  timecode_ms: 4000,
  edited_by_name: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

describe("toReviewComment", () => {
  it("maps a row to the wire shape with its version, without the review id", () => {
    expect(toReviewComment(row)).toEqual({
      id: "c1",
      versionId: "v1",
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

import { toCanvasClientFeedback } from "./wire";

describe("toCanvasClientFeedback", () => {
  it("lists each node's versions newest first with their counts, and totals them", () => {
    expect(
      toCanvasClientFeedback([
        {
          node_id: "n1",
          nodes: { data: { title: "Dosa film" } },
          canvas_review_versions: [
            { version_no: 1, title: "First cut", canvas_review_comments: [{ count: 2 }] },
            { version_no: 2, title: null, canvas_review_comments: [{ count: 1 }] },
          ],
        },
        { node_id: "n2", nodes: [{ data: { title: "" } }], canvas_review_versions: [] },
      ]),
    ).toEqual({
      nodes: [
        {
          nodeId: "n1",
          title: "Dosa film",
          count: 3,
          versions: [
            { versionNo: 2, title: null, count: 1 },
            { versionNo: 1, title: "First cut", count: 2 },
          ],
        },
        { nodeId: "n2", title: "", count: 0, versions: [] },
      ],
      total: 3,
    });
  });

  it("treats a missing title, versions or count as empty", () => {
    expect(
      toCanvasClientFeedback([
        { node_id: "n1", nodes: null, canvas_review_versions: null },
        { node_id: "n2", nodes: null, canvas_review_versions: [{ version_no: 1, title: null, canvas_review_comments: null }] },
      ]),
    ).toEqual({
      nodes: [
        { nodeId: "n1", title: "", count: 0, versions: [] },
        { nodeId: "n2", title: "", count: 0, versions: [{ versionNo: 1, title: null, count: 0 }] },
      ],
      total: 0,
    });
  });
});
