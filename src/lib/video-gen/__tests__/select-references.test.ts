import { describe, it, expect } from "vitest";
import { avatarSheetId, selectReferences, type SelectReferencesInput } from "../select-references";

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
