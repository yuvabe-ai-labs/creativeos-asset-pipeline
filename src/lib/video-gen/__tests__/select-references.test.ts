import { describe, it, expect } from "vitest";
import { avatarSheetId, referenceCapFor, selectReferences, sheetsUnusable, type SelectReferencesInput } from "../select-references";
import { GEMINI_OMNI_IMAGE_INPUTS } from "../gemini-omni-shape";

describe("referenceCapFor (D428)", () => {
  const none = { hasStartFrame: false, hasEndFrame: false };

  it("gives Omni 12 references alone, 6 with a start frame, 5 with both frames", () => {
    expect(referenceCapFor(GEMINI_OMNI_IMAGE_INPUTS, none)).toBe(12);
    expect(referenceCapFor(GEMINI_OMNI_IMAGE_INPUTS, { hasStartFrame: true, hasEndFrame: false })).toBe(6);
    expect(referenceCapFor(GEMINI_OMNI_IMAGE_INPUTS, { hasStartFrame: true, hasEndFrame: true })).toBe(5);
  });

  it("leaves a model without maxImagesWithFrames at its own cap", () => {
    expect(referenceCapFor({ maxReferenceImages: 5 }, { hasStartFrame: true, hasEndFrame: true })).toBe(5);
  });

  it("never goes below zero or above the model's cap", () => {
    expect(referenceCapFor({ maxReferenceImages: 3, maxImagesWithFrames: 1 }, { hasStartFrame: true, hasEndFrame: true })).toBe(0);
    expect(referenceCapFor({ maxReferenceImages: 3, maxImagesWithFrames: 10 }, { hasStartFrame: true, hasEndFrame: false })).toBe(3);
  });
});

const imgs = (...ids: string[]) => ids.map((id) => ({ id }));
const base = (over: Partial<SelectReferencesInput>): SelectReferencesInput => ({
  images: imgs("pack", "label", "kitchen", "avatar", avatarSheetId("avatar")),
  roles: {},
  cap: 6,
  modelLabel: "Kling 3.0 Omni",
  avatarFrontId: "avatar",
  avatarSheetId: avatarSheetId("avatar"),
  ...over,
});

describe("selectReferences (D308)", () => {
  it("sends everything, in prompt order, when it fits", () => {
    expect(selectReferences(base({})).sent).toEqual(["pack", "label", "kitchen", "avatar", "avatar:sheet"]);
  });

  it("fills tight slots by priority: avatar front, cited, sheet, then the rest in order", () => {
    const r = selectReferences(base({ cap: 3, citedIds: new Set(["kitchen"]) }));
    expect(r.sent).toEqual(["kitchen", "avatar", "avatar:sheet"]);
    expect(r.leftOut).toEqual([
      { id: "pack", reason: "No room: Kling 3.0 Omni takes 3" },
      { id: "label", reason: "No room: Kling 3.0 Omni takes 3" },
    ]);
  });

  it("keeps what was sent in prompt order, whatever the priority that chose it", () => {
    expect(selectReferences(base({ cap: 2, citedIds: new Set(["pack"]) })).sent).toEqual(["pack", "avatar"]);
  });

  it("puts explicit references first, then fills by priority", () => {
    const r = selectReferences(base({ cap: 2, roles: { label: "reference" } }));
    expect(r.sent).toEqual(["label", "avatar"]);
  });

  it("never sends an image turned off, or one the model can't use", () => {
    const r = selectReferences(base({
      roles: { pack: "off" },
      unusable: new Map([["avatar:sheet", "Seedance can't use the profile sheet"]]),
    }));
    expect(r.sent).toEqual(["label", "kitchen", "avatar"]);
    expect(r.leftOut).toEqual([
      { id: "pack", reason: "Turned off" },
      { id: "avatar:sheet", reason: "Seedance can't use the profile sheet" },
    ]);
  });

  it("leaves frames out of the reference count", () => {
    const r = selectReferences(base({ cap: 1, roles: { pack: "start_frame" } }));
    expect(r.sent).toEqual(["avatar"]);
    expect(r.leftOut.map((l) => l.id)).not.toContain("pack");
  });

  it("counts explicit references beyond the cap as over it", () => {
    const r = selectReferences(base({ cap: 1, roles: { pack: "reference", label: "reference" } }));
    expect(r.sent).toEqual(["pack"]);
    expect(r.overCap).toBe(1);
  });

  it("leaves every non-frame image out on a model that takes no references", () => {
    const r = selectReferences(base({ cap: 0, images: imgs("pack"), avatarFrontId: null, avatarSheetId: null }));
    expect(r.sent).toEqual([]);
    expect(r.leftOut).toEqual([{ id: "pack", reason: "Kling 3.0 Omni takes no reference images" }]);
  });
});

describe("selectReferences — frames that exclude references (D308)", () => {
  it("sends no references once a frame is set on a model that can't combine them", () => {
    const r = selectReferences(base({ roles: { pack: "start_frame" }, framesExcludeReferences: true }));
    expect(r.sent).toEqual([]);
    expect(r.leftOut[0]).toEqual({ id: "label", reason: "Kling 3.0 Omni can't use references with a start or end frame" });
  });
  it("fills references as usual on that model when no frame is set", () => {
    expect(selectReferences(base({ framesExcludeReferences: true })).sent).toHaveLength(5);
  });
});

// D436 — with two avatars wired in, Seedance must refuse both sheets, not only the presenter's.
describe("sheetsUnusable", () => {
  it("refuses every avatar sheet among the images, and nothing else", () => {
    const m = sheetsUnusable(["pack", avatarSheetId("a1"), "a2", avatarSheetId("a2")], "no sheets");
    expect([...(m?.keys() ?? [])]).toEqual(["a1:sheet", "a2:sheet"]);
    expect(sheetsUnusable(["pack", "a1"], "no sheets")).toBeUndefined();
  });
});
