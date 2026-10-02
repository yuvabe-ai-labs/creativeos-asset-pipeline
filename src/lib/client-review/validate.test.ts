import { describe, it, expect } from "vitest";
import { parseNewComment, parseCommentEdit, toTimecodeMs, cutExtension } from "./validate";

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
