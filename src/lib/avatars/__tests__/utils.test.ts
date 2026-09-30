import { describe, it, expect } from "vitest";
import {
  avatarReadinessGaps, isAvatarReady, frontChangePatch,
  sheetChangePatch, withStatus, planAvatarUpdate, validateAvatarImageFile,
} from "../utils";
import { AVATAR_IMAGE_MAX_BYTES, AVATAR_NAME_MAX } from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";

describe("avatarReadinessGaps", () => {
  it("is empty for a complete avatar", () => {
    expect(avatarReadinessGaps(makeAvatar())).toEqual([]);
    expect(isAvatarReady(makeAvatar())).toBe(true);
  });

  it("lists every missing part of an empty draft", () => {
    const gaps = avatarReadinessGaps(makeAvatar({ name: "  ", front: null, sheet: null }));
    expect(gaps).toEqual(["name", "front", "sheet"]);
  });

  it("reports a stale sheet separately from a missing one", () => {
    expect(avatarReadinessGaps(makeAvatar({ sheetStale: true }))).toEqual(["sheet-stale"]);
  });

  it("an uploaded front, a name and a current sheet are ready — no declaration step", () => {
    expect(avatarReadinessGaps(makeAvatar())).toEqual([]);
  });
});

describe("frontChangePatch", () => {
  it("an uploaded front is a specific person and marks an existing sheet stale", () => {
    const patch = frontChangePatch(makeAvatar(), makeImage());
    expect(patch).toMatchObject({ sheetStale: true, personType: "specific" });
  });

  it("a generated front is a generic person", () => {
    expect(frontChangePatch(makeAvatar(), makeImage(GENERATED)).personType).toBe("generic");
  });

  it("does not mark the sheet stale when there is no sheet yet", () => {
    expect(frontChangePatch(makeAvatar({ sheet: null }), makeImage()).sheetStale).toBe(false);
  });
});

describe("sheetChangePatch", () => {
  it("a new sheet is never stale", () => {
    expect(sheetChangePatch(makeImage())).toMatchObject({ sheetStale: false });
  });
});

describe("withStatus", () => {
  it("drops a ready avatar back to draft when a new front stales its sheet", () => {
    const current = makeAvatar();
    const result = withStatus(current, frontChangePatch(current, makeImage()));
    expect(result).toMatchObject({ sheetStale: true, status: "draft" });
  });

  it("leaves status alone when the avatar stays complete", () => {
    expect(withStatus(makeAvatar(), { story: "new" }).status).toBeUndefined();
  });
});

describe("planAvatarUpdate", () => {
  it("trims the name and rejects one that is too long", () => {
    const ok = planAvatarUpdate(makeAvatar(), { name: "  Meera " });
    expect(ok).toEqual({ ok: true, patch: { name: "Meera" } });
    const long = planAvatarUpdate(makeAvatar(), { name: "x".repeat(AVATAR_NAME_MAX + 1) });
    expect(long.ok).toBe(false);
  });

  it("refuses ready while something is missing, and names it", () => {
    const result = planAvatarUpdate(makeAvatar({ status: "draft", sheet: null }), { status: "ready" });
    expect(result).toEqual({ ok: false, error: "Still needed: a profile sheet." });
  });

  it("allows ready when the same request supplies the missing name", () => {
    const current = makeAvatar({ status: "draft", name: "" });
    const result = planAvatarUpdate(current, { name: "Riya", status: "ready" });
    expect(result).toEqual({ ok: true, patch: { name: "Riya", status: "ready" } });
  });

  it("clearing the name of a ready avatar returns it to draft", () => {
    const result = planAvatarUpdate(makeAvatar(), { name: "" });
    expect(result).toEqual({ ok: true, patch: { name: "", status: "draft" } });
  });
});

describe("validateAvatarImageFile", () => {
  it("accepts a png within the limit", () => {
    expect(validateAvatarImageFile({ name: "face.PNG", size: 1000 })).toBeNull();
  });
  it("rejects other types and oversize files with the rule stated", () => {
    expect(validateAvatarImageFile({ name: "face.gif", size: 1000 })).toMatch(/png, jpg, jpeg, webp/);
    expect(validateAvatarImageFile({ name: "face.png", size: AVATAR_IMAGE_MAX_BYTES + 1 })).toMatch(/15 MB/);
  });
});
