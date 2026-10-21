import { describe, it, expect } from "vitest";
import { nextViewedId, resolveViewedVersion, stepVersionId } from "./viewing";

const v = (id: string) => ({ id });
const list = [v("v3"), v("v2"), v("v1")]; // newest first

describe("resolveViewedVersion", () => {
  it("follows the active version when nothing is viewed", () => {
    expect(resolveViewedVersion(list, "v2", null)).toEqual({ viewed: list[1], index: 1, isViewingOther: false });
  });
  it("shows the viewed version and flags it", () => {
    expect(resolveViewedVersion(list, "v3", "v1")).toEqual({ viewed: list[2], index: 2, isViewingOther: true });
  });
  it("falls back to active when the viewed id is gone", () => {
    expect(resolveViewedVersion(list, "v3", "gone")).toEqual({ viewed: list[0], index: 0, isViewingOther: false });
  });
  it("is empty with no versions", () => {
    expect(resolveViewedVersion([], null, null)).toEqual({ viewed: null, index: -1, isViewingOther: false });
  });
  it("counts any version as other when there is no active one", () => {
    expect(resolveViewedVersion(list, null, "v2").isViewingOther).toBe(true);
  });
});

describe("stepVersionId", () => {
  it("+1 goes older, -1 goes newer", () => {
    expect(stepVersionId(list, "v2", 1)).toBe("v1");
    expect(stepVersionId(list, "v2", -1)).toBe("v3");
  });
  it("stops at the ends", () => {
    expect(stepVersionId(list, "v1", 1)).toBeNull();
    expect(stepVersionId(list, "v3", -1)).toBeNull();
  });
  it("starts at the newest when nothing is on screen", () => {
    expect(stepVersionId(list, null, 1)).toBe("v3");
    expect(stepVersionId([], null, 1)).toBeNull();
  });
});

describe("nextViewedId", () => {
  it("viewing the active version means following it", () => {
    expect(nextViewedId("v3", "v3")).toBeNull();
    expect(nextViewedId("v3", "v1")).toBe("v1");
  });
});
