import { describe, expect, it } from "vitest";
import {
  buildModelPatch, isStatusDisabled, replacementText, runSave, type DraftDetails, type SavedDetails,
} from "../model-details-patch";

const saved: SavedDetails = {
  label: "Flux", pickerLabel: null, providerLabel: "Fal", description: null,
  status: "draft", replacedBy: null, sortOrder: 10,
};
const same: DraftDetails = {
  label: "Flux", pickerLabel: "", providerLabel: "Fal", description: "",
  sortOrder: "10", status: "draft", replacedBy: null,
};

describe("buildModelPatch", () => {
  it("is empty when nothing changed", () => expect(buildModelPatch(saved, same)).toEqual({}));
  it("sends only the changed field", () =>
    expect(buildModelPatch(saved, { ...same, label: "Flux 2" })).toEqual({ label: "Flux 2" }));
  it("leaves replaced_by out when the status is not retired", () => {
    const s = { ...saved, status: "retired", replacedBy: "x" };
    const patch = buildModelPatch(s, { ...same, status: "draft", replacedBy: null });
    expect(patch).toEqual({ status: "draft" });
  });
  it("sends replaced_by when retired", () =>
    expect(buildModelPatch(saved, { ...same, status: "retired", replacedBy: "x" })).toEqual({
      status: "retired", replaced_by: "x",
    }));
  it("trims every text field and sends nothing for whitespace alone", () => {
    expect(buildModelPatch(saved, { ...same, label: "  Flux  ", providerLabel: " Fal " })).toEqual({});
    expect(buildModelPatch(saved, { ...same, label: " Flux 2 ", pickerLabel: " F ", providerLabel: " Fal AI ", description: " d " }))
      .toEqual({ label: "Flux 2", picker_label: "F", provider_label: "Fal AI", description: "d" });
    expect(buildModelPatch(saved, { ...same, pickerLabel: "   ", description: "  " })).toEqual({});
  });
  it("does not send a non-whole sort order", () => {
    expect(buildModelPatch(saved, { ...same, sortOrder: "abc" })).toEqual({});
    expect(buildModelPatch(saved, { ...same, sortOrder: "1.5" })).toEqual({});
    expect(buildModelPatch(saved, { ...same, sortOrder: "" })).toEqual({});
  });
});

describe("isStatusDisabled", () => {
  it("disables live only when the model cannot go live", () => {
    expect(isStatusDisabled("live", false)).toBe(true);
    expect(isStatusDisabled("live", true)).toBe(false);
    expect(isStatusDisabled("draft", false)).toBe(false);
    expect(isStatusDisabled("retired", false)).toBe(false);
  });
});

describe("replacementText", () => {
  const live = [{ id: "a", label: "Model A" }];
  it("names no replacement, a live one, and one that left live", () => {
    expect(replacementText(null, live, null)).toBe("No replacement");
    expect(replacementText("a", live, null)).toBe("Model A");
    expect(replacementText("old", live, { id: "old", label: "Old model" })).toBe("Old model (no longer live)");
    expect(replacementText("gone", live, null)).toBe("gone (no longer live)");
  });
});

describe("runSave", () => {
  it("passes the action's answer through", async () => {
    expect(await runSave(async () => ({}))).toEqual({});
    expect(await runSave(async () => ({ error: "Nope." }))).toEqual({ error: "Nope." });
  });
  it("turns a thrown call into the plain error", async () => {
    expect(await runSave(async () => { throw new Error("network"); })).toEqual({ error: "Could not save. Try again." });
  });
});
