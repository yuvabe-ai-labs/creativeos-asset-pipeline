import { describe, it, expect } from "vitest";
import { overlayToMaskRGBA, EDIT_ALPHA, KEEP_ALPHA } from "../mask";

describe("overlayToMaskRGBA", () => {
  it("maps painted pixels to EDIT_ALPHA and untouched pixels to KEEP_ALPHA", () => {
    // two pixels: [0] painted (alpha 200), [1] untouched (alpha 0)
    const data = new Uint8ClampedArray([255, 0, 0, 200, 0, 0, 0, 0]);
    const out = overlayToMaskRGBA({ data, width: 2, height: 1 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(out.data[3]).toBe(EDIT_ALPHA); // painted → editable
    expect(out.data[7]).toBe(KEEP_ALPHA); // untouched → preserved
    // RGB is normalized to black
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([0, 0, 0]);
  });
});
