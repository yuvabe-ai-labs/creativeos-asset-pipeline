import { describe, it, expect } from "vitest";
import { parseNewComment, parseCommentEdit, toTimecodeMs, cutExtension, isCutPathFor, isUuid } from "./validate";

describe("toTimecodeMs", () => {
  it("rounds seconds to whole milliseconds", () => {
    expect(toTimecodeMs(7.2345)).toBe(7235);
  });
  it("clamps NaN, negatives and Infinity to 0 (video not loaded yet)", () => {
    expect(toTimecodeMs(Number.NaN)).toBe(0);
    expect(toTimecodeMs(-3)).toBe(0);
    expect(toTimecodeMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parseNewComment", () => {
  it("accepts and trims a valid comment", () => {
    const r = parseNewComment({ authorName: "  Priya ", body: " Logo too small ", timecodeMs: 4000 });
    expect(r).toEqual({ ok: true, value: { authorName: "Priya", body: "Logo too small", timecodeMs: 4000 } });
  });
  it("rejects a whitespace-only name", () => {
    expect(parseNewComment({ authorName: "   ", body: "x", timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a whitespace-only body", () => {
    expect(parseNewComment({ authorName: "Priya", body: " \n ", timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a name over 60 chars and a body over 2000 chars", () => {
    expect(parseNewComment({ authorName: "a".repeat(61), body: "x", timecodeMs: 0 }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x".repeat(2001), timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a missing, negative or fractional timecode", () => {
    expect(parseNewComment({ authorName: "P", body: "x" }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: -1 }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: 1.5 }).ok).toBe(false);
  });
  it("rejects a timecode past 24 hours", () => {
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: 86_400_000 }).ok).toBe(true);
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: 86_400_001 })).toEqual({
      ok: false,
      error: "A timecode is required.",
    });
  });
  it("rejects non-object input", () => {
    expect(parseNewComment(null).ok).toBe(false);
    expect(parseNewComment("hi").ok).toBe(false);
  });
});

describe("parseCommentEdit", () => {
  it("accepts and trims a valid edit", () => {
    expect(parseCommentEdit({ editorName: " Arjun ", body: " Warmer " })).toEqual({
      ok: true,
      value: { editorName: "Arjun", body: "Warmer" },
    });
  });
  it("rejects clearing a comment to empty", () => {
    expect(parseCommentEdit({ editorName: "Arjun", body: "   " }).ok).toBe(false);
  });
  it("ignores extra fields such as timecodeMs", () => {
    const r = parseCommentEdit({ editorName: "A", body: "b", timecodeMs: 999, authorName: "X" });
    expect(r).toEqual({ ok: true, value: { editorName: "A", body: "b" } });
  });
});

describe("cutExtension", () => {
  it("returns the lowercase extension for allowed video files", () => {
    expect(cutExtension("Final Cut.MP4")).toBe("mp4");
    expect(cutExtension("v2.mov")).toBe("mov");
    expect(cutExtension("a.webm")).toBe("webm");
  });
  it("returns null for anything else", () => {
    expect(cutExtension("poster.png")).toBeNull();
    expect(cutExtension("noext")).toBeNull();
  });
});

describe("isCutPathFor", () => {
  const prefix = "clients/c1/canvases/cv1/nodes/n1/client-review/";
  it("accepts the shape pathForClientReviewCut produces", () => {
    expect(isCutPathFor(prefix, `${prefix}cut__2026-10-06T08-54-55-123Z.mp4`)).toBe(true);
    expect(isCutPathFor(prefix, `${prefix}cut__2026-10-06T08-54-55-123Z.webm`)).toBe(true);
  });
  it("rejects traversal, encoded traversal and extra segments", () => {
    expect(isCutPathFor(prefix, `${prefix}../../x/cut__a.mp4`)).toBe(false);
    expect(isCutPathFor(prefix, `${prefix}%2e%2e/cut__a.mp4`)).toBe(false);
    expect(isCutPathFor(prefix, `${prefix}sub/cut__a.mp4`)).toBe(false);
  });
  it("rejects non-video extensions and other prefixes", () => {
    expect(isCutPathFor(prefix, `${prefix}cut__a.html`)).toBe(false);
    expect(isCutPathFor(prefix, `${prefix}x.mp4`)).toBe(false);
    expect(isCutPathFor(prefix, "clients/c1/canvases/cv1/nodes/OTHER/client-review/cut__a.mp4")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid("3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c")).toBe(true);
    expect(isUuid("3F2B8C1E-9A4D-4E7F-B1C2-0D9E8F7A6B5C")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isUuid("c1")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c-x")).toBe(false);
    expect(isUuid("3f2b8c1e9a4d4e7fb1c20d9e8f7a6b5c")).toBe(false);
  });
});
