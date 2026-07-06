import { describe, it, expect } from "vitest";
import { editModeForModel } from "../edit-mode";

describe("editModeForModel", () => {
  it("returns 'paint' when the model supports a mask", () => {
    expect(editModeForModel(true)).toBe("paint");
  });
  it("returns 'type' when the model does not support a mask", () => {
    expect(editModeForModel(false)).toBe("type");
    expect(editModeForModel(undefined)).toBe("type");
  });
});
