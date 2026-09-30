import { describe, it, expect } from "vitest";
import {
  avatarReadinessGaps, isAvatarReady, needsLikenessDeclaration, frontChangePatch,
  sheetChangePatch, withStatus, planAvatarUpdate, validateAvatarImageFile,
} from "../utils";
import { AVATAR_IMAGE_MAX_BYTES, AVATAR_NAME_MAX } from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";

const ctx = { userId: "user-9", now: "2026-10-01T00:00:00.000Z" };

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

  it("requires a declaration for an uploaded front, but not a generated one", () => {
    const undeclared = { personType: null, likenessConfirmedAt: null, likenessConfirmedBy: null };
    expect(avatarReadinessGaps(makeAvatar(undeclared))).toEqual(["declaration"]);
    expect(needsLikenessDeclaration(makeAvatar({ ...undeclared, front: makeImage(GENERATED) }))).toBe(false);
  });
});

describe("frontChangePatch", () => {
  it("an uploaded front clears the declaration and marks an existing sheet stale", () => {
    const patch = frontChangePatch(makeAvatar(), makeImage());
    expect(patch).toMatchObject({
      sheetStale: true, personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null,
    });
  });

  it("a generated front is generic, with no declaration to ask for", () => {
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
  it("drops a ready avatar back to draft when the patch leaves a gap", () => {
    const current = makeAvatar();
    expect(withStatus(current, frontChangePatch(current, makeImage())).status).toBe("draft");
  });

  it("leaves status alone when the avatar stays complete", () => {
    expect(withStatus(makeAvatar(), { story: "new" }).status).toBeUndefined();
  });
});

describe("planAvatarUpdate", () => {
  it("trims the name and rejects one that is too long", () => {
    const ok = planAvatarUpdate(makeAvatar(), { name: "  Meera " }, ctx);
    expect(ok).toEqual({ ok: true, patch: { name: "Meera" } });
    const long = planAvatarUpdate(makeAvatar(), { name: "x".repeat(AVATAR_NAME_MAX + 1) }, ctx);
    expect(long.ok).toBe(false);
  });

  it("records who declared the person type and when", () => {
    const current = makeAvatar({ personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null, status: "draft" });
    const result = planAvatarUpdate(current, { declaration: { personType: "generic" } }, ctx);
    expect(result).toEqual({
      ok: true,
      patch: { personType: "generic", likenessConfirmedBy: "user-9", likenessConfirmedAt: ctx.now },
    });
  });

  it("refuses a declaration when the front image was generated", () => {
    const current = makeAvatar({ front: makeImage(GENERATED) });
    expect(planAvatarUpdate(current, { declaration: { personType: "specific" } }, ctx).ok).toBe(false);
  });

  it("refuses ready while something is missing, and names it", () => {
    const result = planAvatarUpdate(makeAvatar({ status: "draft", sheet: null }), { status: "ready" }, ctx);
    expect(result).toEqual({ ok: false, error: "Still needed: a profile sheet." });
  });

  it("allows ready when the same request supplies the missing name", () => {
    const current = makeAvatar({ status: "draft", name: "" });
    const result = planAvatarUpdate(current, { name: "Riya", status: "ready" }, ctx);
    expect(result).toEqual({ ok: true, patch: { name: "Riya", status: "ready" } });
  });

  it("clearing the name of a ready avatar returns it to draft", () => {
    const result = planAvatarUpdate(makeAvatar(), { name: "" }, ctx);
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
