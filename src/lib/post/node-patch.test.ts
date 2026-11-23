import { describe, it, expect } from "vitest";
import { postPatchForStore } from "./node-patch";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("postPatchForStore", () => {
  it("writes nothing when the canvas is not editable", () => {
    expect(postPatchForStore({ layers: [] }, false, now)).toBeNull();
    expect(postPatchForStore({ title: "x" }, false, now)).toBeNull();
    expect(postPatchForStore({ thumbnail: "data:" }, false, now)).toBeNull();
  });

  it("stamps a design edit when editable", () => {
    expect(postPatchForStore({ layers: [] }, true, now)).toEqual({
      layers: [],
      layersUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("passes a non-design patch through unstamped when editable", () => {
    expect(postPatchForStore({ title: "x" }, true, now)).toEqual({ title: "x" });
  });
});
