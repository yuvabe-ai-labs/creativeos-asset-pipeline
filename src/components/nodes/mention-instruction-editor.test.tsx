import { describe, it, expect } from "vitest";
import { parseSegments, serializeSegments } from "./mention-instruction-editor";

describe("parseSegments", () => {
  it("returns a single text segment for plain text", () => {
    expect(parseSegments("hello world")).toEqual([
      { kind: "text", text: "hello world" },
    ]);
  });

  it("parses a token into a mention segment", () => {
    expect(parseSegments("@[Image: Hero](id-1)")).toEqual([
      { kind: "mention", label: "Image: Hero", id: "id-1" },
    ]);
  });

  it("splits text around a mention correctly", () => {
    expect(parseSegments("use @[Image: A](n1) as base")).toEqual([
      { kind: "text", text: "use " },
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "text", text: " as base" },
    ]);
  });

  it("handles two adjacent mentions", () => {
    expect(parseSegments("@[Image: A](n1) and @[File: B](n2)")).toEqual([
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "text", text: " and " },
      { kind: "mention", label: "File: B", id: "n2" },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(parseSegments("")).toEqual([]);
  });

  it("drops empty text segments", () => {
    const result = parseSegments("@[Image: X](n1) tail");
    expect(result[0].kind).toBe("mention");
  });
});

describe("serializeSegments", () => {
  it("serializes text segments as-is", () => {
    expect(serializeSegments([{ kind: "text", text: "hello" }])).toBe("hello");
  });

  it("serializes a mention segment to token format", () => {
    expect(
      serializeSegments([{ kind: "mention", label: "Image: Hero", id: "n1" }])
    ).toBe("@[Image: Hero](n1)");
  });

  it("round-trips parse then serialize", () => {
    const original = "use @[Image: A](n1) as base, @[File: B](n2) for ref";
    expect(serializeSegments(parseSegments(original))).toBe(original);
  });
});
