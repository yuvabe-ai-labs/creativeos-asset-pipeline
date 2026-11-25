import { describe, expect, it } from "vitest";
import { isPatchablePath, kbFieldPatchSchema } from "../field-patch";

describe("isPatchablePath", () => {
  it("allows document and Image Analysis fields, nothing else", () => {
    expect(isPatchablePath(["target_audience", "age_range"])).toBe(true);
    expect(isPatchablePath(["creative_direction", "video", "pacing"])).toBe(true);
    expect(isPatchablePath(["image_analysis", "aesthetic"])).toBe(true);
    expect(isPatchablePath(["brand"])).toBe(false);
    expect(isPatchablePath(["target_audience", "nope"])).toBe(false);
    expect(isPatchablePath(["target_audience"])).toBe(false);
    expect(isPatchablePath(["creative_direction", "video"])).toBe(false);
    expect(isPatchablePath(["target_audience", "age_range", "value"])).toBe(false);
  });
});

describe("kbFieldPatchSchema", () => {
  it("takes a review, an edit, or both", () => {
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: { status: "approved" } }).success).toBe(true);
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: { value: ["a"], status: "edited" } }).success).toBe(true);
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "content_rules"], patch: { value: null } }).success).toBe(true);
  });
  it("refuses a patch that changes nothing, an unknown status, or a key a field does not have", () => {
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: {} }).success).toBe(false);
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: { status: "done" } }).success).toBe(false);
    expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: { status: "approved", extra: 1 } }).success).toBe(false);
  });
});
