import { describe, it, expect } from "vitest";
import { cutDownloadName, formatCutTimecode, withAddedComment, withEditedComment } from "./utils";
import type { PublicReview, ReviewComment } from "./wire";

describe("formatCutTimecode", () => {
  it("floors to the whole second the player shows", () => {
    expect(formatCutTimecode(4600)).toBe("0:04");
    expect(formatCutTimecode(4999)).toBe("0:04");
  });
  it("formats minutes and zero-pads seconds", () => {
    expect(formatCutTimecode(0)).toBe("0:00");
    expect(formatCutTimecode(65_000)).toBe("1:05");
    expect(formatCutTimecode(600_000)).toBe("10:00");
  });
  it("treats negative or non-finite input as 0:00", () => {
    expect(formatCutTimecode(-5)).toBe("0:00");
    expect(formatCutTimecode(Number.NaN)).toBe("0:00");
  });
});

const c = (id: string, body = "x"): ReviewComment => ({
  id, versionId: "v1", authorName: "P", body, timecodeMs: 0, editedByName: null, createdAt: "t", updatedAt: "t",
});
const review = (comments: ReviewComment[]): PublicReview => ({
  title: "T", versionNo: 1, videoUrl: "v", allowDownload: true, createdAt: "t", comments,
});

describe("withAddedComment", () => {
  it("appends the posted comment", () => {
    expect(withAddedComment(review([c("a")]), c("b"))?.comments.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("does not duplicate a comment a refetch already brought in", () => {
    expect(withAddedComment(review([c("a"), c("b")]), c("b"))?.comments).toHaveLength(2);
  });
  it("leaves an empty cache empty", () => {
    expect(withAddedComment(undefined, c("a"))).toBeUndefined();
  });
});

describe("withEditedComment", () => {
  it("replaces the edited comment in place", () => {
    const out = withEditedComment(review([c("a"), c("b")]), c("a", "new"));
    expect(out?.comments.map((x) => [x.id, x.body])).toEqual([["a", "new"], ["b", "x"]]);
  });
  it("leaves an empty cache empty", () => {
    expect(withEditedComment(undefined, c("a"))).toBeUndefined();
  });
});

describe("cutDownloadName (D478)", () => {
  it("names the file after the title, with the cut's own extension", () => {
    expect(cutDownloadName("Dosa film: the \"final\" cut", "a/b/cut__x.MOV")).toBe("dosa-film-the-final-cut.mov");
  });
  it("falls back when the title has no usable characters or the path no known extension", () => {
    expect(cutDownloadName("", "a/cut__x.mp4")).toBe("video.mp4");
    expect(cutDownloadName("Reel", "a/cut__x")).toBe("reel.mp4");
  });
});
