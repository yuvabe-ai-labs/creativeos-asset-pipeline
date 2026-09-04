import { describe, it, expect } from "vitest";
import { base64Bytes, validateAnnotations } from "../payload";
import type { AnnotationPayload } from "../payload";
import {
  MAX_ANNOTATIONS_PER_DECISION,
  MAX_MASK_BYTES,
} from "../constants";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=", // "hello"
    frameBase64: null,
    note: "logo too small",
    bounds: null,
    ...over,
  };
}

describe("base64Bytes", () => {
  it("computes decoded size from base64 length and padding", () => {
    expect(base64Bytes("aGVsbG8=")).toBe(5); // "hello"
    expect(base64Bytes("aGVsbG8h")).toBe(6); // "hello!"
    expect(base64Bytes("")).toBe(0);
  });
});

describe("validateAnnotations", () => {
  it("accepts a well-formed image annotation", () => {
    expect(validateAnnotations([ann()])).toBeNull();
  });

  it("accepts a well-formed video-frame annotation", () => {
    expect(
      validateAnnotations([
        ann({ kind: "video-frame", timecodeMs: 4000, frameBase64: "aGVsbG8=" }),
      ]),
    ).toBeNull();
  });

  it("rejects an empty note", () => {
    expect(validateAnnotations([ann({ note: "  " })])).toMatch(/note/i);
  });

  it("rejects image annotations carrying video fields", () => {
    expect(validateAnnotations([ann({ timecodeMs: 1000 })])).toMatch(/image/i);
    expect(validateAnnotations([ann({ frameBase64: "aGVsbG8=" })])).toMatch(/image/i);
  });

  it("rejects video-frame annotations missing timecode or frame", () => {
    expect(
      validateAnnotations([ann({ kind: "video-frame", frameBase64: "aGVsbG8=" })]),
    ).toMatch(/timecode/i);
    expect(
      validateAnnotations([ann({ kind: "video-frame", timecodeMs: 4000 })]),
    ).toMatch(/frame/i);
  });

  it("rejects non-contiguous or duplicate seq", () => {
    expect(validateAnnotations([ann({ seq: 2 })])).toMatch(/seq/i);
    expect(
      validateAnnotations([ann({ seq: 1 }), ann({ seq: 1, note: "other" })]),
    ).toMatch(/seq/i);
  });

  it("rejects more than the per-decision cap", () => {
    const many = Array.from({ length: MAX_ANNOTATIONS_PER_DECISION + 1 }, (_, i) =>
      ann({ seq: i + 1 }),
    );
    expect(validateAnnotations(many)).toMatch(/20/);
  });

  it("rejects an oversized mask", () => {
    // 4 base64 chars ≈ 3 bytes → this string decodes to just over MAX_MASK_BYTES.
    const big = "A".repeat(Math.ceil((MAX_MASK_BYTES + 3) / 3) * 4);
    expect(validateAnnotations([ann({ overlayBase64: big })])).toMatch(/mask/i);
  });

  it("rejects unknown kind values", () => {
    const unknown = {
      seq: 1,
      kind: "something-else",
      timecodeMs: null,
      overlayBase64: "aGVsbG8=",
      frameBase64: null,
      note: "test",
    } as unknown as AnnotationPayload;
    expect(validateAnnotations([unknown])).toMatch(/kind/i);
  });

  it("rejects video-frame with omitted frameBase64 (undefined)", () => {
    const noFrame = {
      seq: 1,
      kind: "video-frame",
      timecodeMs: 4000,
      overlayBase64: "aGVsbG8=",
      frameBase64: undefined,
      note: "test",
    } as unknown as AnnotationPayload;
    expect(validateAnnotations([noFrame])).toMatch(/frame/i);
  });

  it("rejects video-frame with omitted timecodeMs (undefined)", () => {
    const noTimecode = {
      seq: 1,
      kind: "video-frame",
      timecodeMs: undefined,
      overlayBase64: "aGVsbG8=",
      frameBase64: "aGVsbG8=",
      note: "test",
    } as unknown as AnnotationPayload;
    expect(validateAnnotations([noTimecode])).toMatch(/timecode/i);
  });
});

// D218: bounds are part of the wire shape now — the client used to strip them, which is
// what left stored pins with no position and stacked them down the left edge.
describe("validateAnnotations — region bounds", () => {
  it("accepts fractions inside [0,1], including a zero-area point annotation", () => {
    expect(
      validateAnnotations([ann({ bounds: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } })]),
    ).toBeNull();
    expect(
      validateAnnotations([ann({ bounds: { x: 0.5, y: 0.5, w: 0, h: 0 } })]),
    ).toBeNull();
  });

  it("accepts a null bounds (pre-D218 shape, and a defensive no-stroke commit)", () => {
    expect(validateAnnotations([ann({ bounds: null })])).toBeNull();
  });

  it("rejects a fraction outside [0,1] — it would render the pin off the media", () => {
    expect(
      validateAnnotations([ann({ bounds: { x: 1.4, y: 0.2, w: 0.3, h: 0.4 } })]),
    ).toMatch(/fractions between 0 and 1/);
    expect(
      validateAnnotations([ann({ bounds: { x: -0.1, y: 0.2, w: 0.3, h: 0.4 } })]),
    ).toMatch(/fractions between 0 and 1/);
  });

  it("rejects a non-finite bound", () => {
    expect(
      validateAnnotations([ann({ bounds: { x: NaN, y: 0.2, w: 0.3, h: 0.4 } })]),
    ).toMatch(/fractions between 0 and 1/);
  });
});
