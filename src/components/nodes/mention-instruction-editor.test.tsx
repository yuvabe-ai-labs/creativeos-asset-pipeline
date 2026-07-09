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

describe("parseSegments — edge cases", () => {
  it("handles a token immediately at end of string (no trailing text)", () => {
    const result = parseSegments("base @[Image: X](n1)");
    expect(result).toEqual([
      { kind: "text", text: "base " },
      { kind: "mention", label: "Image: X", id: "n1" },
    ]);
  });

  it("handles back-to-back tokens with no separator", () => {
    const result = parseSegments("@[Image: A](n1)@[File: B](n2)");
    expect(result).toEqual([
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "mention", label: "File: B", id: "n2" },
    ]);
  });

  it("treats malformed @ (no brackets) as plain text", () => {
    const result = parseSegments("hello @world");
    expect(result).toEqual([{ kind: "text", text: "hello @world" }]);
  });
});

describe("serializeSegments — edge cases", () => {
  it("returns empty string for empty array", () => {
    expect(serializeSegments([])).toBe("");
  });

  it("concatenates multiple text segments", () => {
    expect(
      serializeSegments([
        { kind: "text", text: "foo" },
        { kind: "text", text: "bar" },
      ])
    ).toBe("foobar");
  });
});
