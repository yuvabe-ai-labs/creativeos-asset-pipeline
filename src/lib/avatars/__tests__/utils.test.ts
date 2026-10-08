import { describe, it, expect } from "vitest";
import {
  avatarImageContentType, avatarReadinessGaps, errorMessage, isAvatarReady, frontChangePatch,
  sheetChangePatch, withStatus, planAvatarUpdate, validateAvatarImageFile, isUuid,
  hasFourViews, missingViews, sheetKind, sheetViewsPatch, viewsToMake,
} from "../utils";
import { AVATAR_IMAGE_MAX_BYTES, AVATAR_NAME_MAX } from "../constants";
import { GENERATED, makeAvatar, makeImage, makeViews } from "./fixtures";

const ctx = { userId: "user-2", now: "2026-10-01T00:00:00.000Z" };

describe("avatarReadinessGaps", () => {
  it("is empty for a complete avatar", () => {
    expect(avatarReadinessGaps(makeAvatar())).toEqual([]);
    expect(isAvatarReady(makeAvatar())).toBe(true);
  });

  it("lists every missing part of an empty draft", () => {
    const gaps = avatarReadinessGaps(makeAvatar({ name: "  ", front: null, sheet: null }));
    expect(gaps).toEqual(["name", "front"]);
  });

  // D295 — the sheet is an edit of the front, and Seedance refuses an edited image, so it can
  // never be a production input. It is a reference document for people, and never blocks Save.
  it("a profile sheet is optional — an avatar without one is ready", () => {
    const avatar = makeAvatar({ sheet: null });
    expect(avatarReadinessGaps(avatar)).toEqual([]);
    expect(isAvatarReady(avatar)).toBe(true);
  });

  it("a voice is optional", () => {
    expect(avatarReadinessGaps(makeAvatar({ voice: null }))).toEqual([]);
  });

  it("a stale sheet does not block ready either", () => {
    expect(avatarReadinessGaps(makeAvatar({ sheetStale: true }))).toEqual([]);
  });

  it("an uploaded front without consent has the gap 'consent'", () => {
    const avatar = makeAvatar({ likenessConsentBy: null, likenessConsentAt: null });
    expect(avatarReadinessGaps(avatar)).toEqual(["consent"]);
  });

  it("a generated front without consent has no gap — only an upload needs one", () => {
    const avatar = makeAvatar({
      front: makeImage(GENERATED), likenessConsentBy: null, likenessConsentAt: null,
    });
    expect(avatarReadinessGaps(avatar)).toEqual([]);
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

  it("marks the sheet stale even when there is no sheet yet — closes a race where a sheet " +
    "written between this caller's read and write would otherwise go unmarked", () => {
    expect(frontChangePatch(makeAvatar({ sheet: null }), makeImage()).sheetStale).toBe(true);
  });

  it("clears any existing consent record, whether the new front is an upload or generated", () => {
    expect(frontChangePatch(makeAvatar(), makeImage())).toMatchObject({
      likenessConsentBy: null, likenessConsentAt: null,
    });
    expect(frontChangePatch(makeAvatar(), makeImage(GENERATED))).toMatchObject({
      likenessConsentBy: null, likenessConsentAt: null,
    });
  });
});

describe("sheetChangePatch", () => {
  it("a new sheet is never stale", () => {
    expect(sheetChangePatch(makeImage())).toMatchObject({ sheetStale: false });
  });
});

describe("withStatus", () => {
  it("replacing the front of a ready avatar returns it to draft — stale sheet and missing consent", () => {
    const current = makeAvatar();
    const result = withStatus(current, frontChangePatch(current, makeImage()));
    expect(result).toMatchObject({
      sheetStale: true, likenessConsentBy: null, likenessConsentAt: null, status: "draft",
    });
  });

  it("leaves status alone when the avatar stays complete", () => {
    expect(withStatus(makeAvatar(), { story: "new" }).status).toBeUndefined();
  });

  it("states status: draft when the result is incomplete, even if current.status is already draft", () => {
    // Guards the race this fixes: a caller must never rely on current.status already being
    // "draft" to skip stating it — the row it writes over may not match `current` any more.
    const current = makeAvatar({ status: "draft", front: null });
    expect(withStatus(current, { story: "new" }).status).toBe("draft");
  });

  it("never promotes to ready — an already-complete, ready-eligible patch is left as is", () => {
    const current = makeAvatar({ status: "draft" }); // complete except for the status field
    expect(withStatus(current, { story: "new" })).toEqual({ story: "new" });
  });
});

describe("planAvatarUpdate", () => {
  it("trims the name and rejects one that is too long", () => {
    const ok = planAvatarUpdate(makeAvatar(), { name: "  Meera " }, ctx);
    expect(ok).toEqual({ ok: true, patch: { name: "Meera" } });
    const long = planAvatarUpdate(makeAvatar(), { name: "x".repeat(AVATAR_NAME_MAX + 1) }, ctx);
    expect(long.ok).toBe(false);
  });

  it("refuses ready while something is missing, and names it", () => {
    const current = makeAvatar({ status: "draft", front: null });
    const result = planAvatarUpdate(current, { status: "ready" }, ctx);
    expect(result).toEqual({ ok: false, error: "Still needed: a front image." });
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

  it("consent with the matching frontUrl records who confirmed and when", () => {
    const current = makeAvatar({ likenessConsentBy: null, likenessConsentAt: null });
    const result = planAvatarUpdate(current, { consent: { frontUrl: current.front!.url } }, ctx);
    expect(result).toEqual({
      ok: true, patch: { likenessConsentBy: ctx.userId, likenessConsentAt: ctx.now },
    });
  });

  it("refuses consent when the frontUrl no longer matches the avatar's front image", () => {
    const current = makeAvatar({ likenessConsentBy: null, likenessConsentAt: null });
    const result = planAvatarUpdate(
      current, { consent: { frontUrl: "https://storage.googleapis.com/b/other/face.png" } }, ctx,
    );
    expect(result).toEqual({
      ok: false, error: "The front image changed. Confirm the permission again.",
    });
  });

  it("refuses consent for a generated front", () => {
    const current = makeAvatar({
      front: makeImage(GENERATED), likenessConsentBy: null, likenessConsentAt: null,
    });
    const result = planAvatarUpdate(current, { consent: { frontUrl: current.front!.url } }, ctx);
    expect(result).toEqual({ ok: false, error: "Only an uploaded front image needs consent." });
  });

  it("a repeated consent for the same front keeps the original who and when", () => {
    // makeAvatar()'s default is already consented for its default front image.
    const current = makeAvatar();
    const result = planAvatarUpdate(current, { consent: { frontUrl: current.front!.url } }, ctx);
    expect(result).toEqual({ ok: true, patch: {} });
  });

  it("confirms consent and marks ready in the same call", () => {
    const current = makeAvatar({ status: "draft", likenessConsentBy: null, likenessConsentAt: null });
    const result = planAvatarUpdate(
      current, { consent: { frontUrl: current.front!.url }, status: "ready" }, ctx,
    );
    expect(result).toEqual({
      ok: true,
      patch: { likenessConsentBy: ctx.userId, likenessConsentAt: ctx.now, status: "ready" },
    });
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

describe("avatarImageContentType", () => {
  it("returns a present, canonical type as is", () => {
    expect(avatarImageContentType({ name: "face.png", type: "image/png" })).toBe("image/png");
  });

  it("falls back to the extension when type is empty", () => {
    expect(avatarImageContentType({ name: "face.JPG", type: "" })).toBe("image/jpeg");
  });

  it("falls back to the extension for a non-canonical type like image/jpg", () => {
    expect(avatarImageContentType({ name: "face.jpg", type: "image/jpg" })).toBe("image/jpeg");
  });

  it("falls back to the extension for image/pjpeg", () => {
    expect(avatarImageContentType({ name: "face.jpeg", type: "image/pjpeg" })).toBe("image/jpeg");
  });

  it("falls back to octet-stream for an empty type and an unknown extension", () => {
    expect(avatarImageContentType({ name: "face.bmp", type: "" })).toBe("application/octet-stream");
  });
});

describe("errorMessage", () => {
  it("returns an Error's own message", () => {
    expect(errorMessage(new Error("Boom"), "fallback")).toBe("Boom");
  });
  it("returns the fallback for a non-Error throw", () => {
    expect(errorMessage("nope", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("isUuid", () => {
  it("accepts a valid v4 id", () => {
    expect(isUuid("2b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b")).toBe(true);
  });
  it("accepts an uppercase id", () => {
    expect(isUuid("2B1B1B1B-1B1B-4B1B-8B1B-1B1B1B1B1B1B")).toBe(true);
  });
  it("rejects a non-uuid string", () => {
    expect(isUuid("abc")).toBe(false);
  });
  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });
});

describe("hasFourViews (D339)", () => {
  it("needs every view, made from the front the avatar has now", () => {
    expect(hasFourViews(makeAvatar({ sheetViews: makeViews() }))).toBe(true);
    expect(hasFourViews(makeAvatar({ sheetViews: { ...makeViews(), left: null } }))).toBe(false);
    expect(hasFourViews(makeAvatar({ sheetViews: makeViews(), sheetStale: true }))).toBe(false);
    expect(hasFourViews(makeAvatar({ sheetViews: null }))).toBe(false);
  });
});

describe("sheetKind (D339)", () => {
  it("tells the four views from an older three-view sheet and an older upload", () => {
    expect(sheetKind(makeAvatar({ sheetViews: makeViews() }))).toBe("four-view");
    expect(sheetKind(makeAvatar({ sheet: makeImage(GENERATED), sheetViews: null }))).toBe("three-view");
    expect(sheetKind(makeAvatar({ sheet: makeImage(), sheetViews: null }))).toBe("uploaded");
    expect(sheetKind(makeAvatar({ sheet: null, sheetViews: null }))).toBe("none");
  });
});

describe("missingViews (D339)", () => {
  it("lists only the gaps in a current sheet", () => {
    expect(missingViews(makeAvatar({ sheetViews: { ...makeViews(), back: null } }))).toEqual(["back"]);
    expect(missingViews(makeAvatar({ sheetViews: makeViews() }))).toEqual([]);
  });

  it("asks for all four when there are none, or they show an older front", () => {
    const all = ["front", "left", "right", "back"];
    expect(missingViews(makeAvatar({ sheetViews: null }))).toEqual(all);
    expect(missingViews(makeAvatar({ sheetViews: { ...makeViews(), back: null }, sheetStale: true }))).toEqual(all);
  });
});

describe("viewsToMake (D339)", () => {
  it("makes only the views asked for when the sheet is current", () => {
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews() }), ["left"])).toEqual(["left"]);
  });

  it("makes all four when there are none, or they show an older front, whatever was asked", () => {
    const all = ["front", "left", "right", "back"];
    expect(viewsToMake(makeAvatar({ sheetViews: null }), ["left"])).toEqual(all);
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews(), sheetStale: true }), ["left"])).toEqual(all);
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews() }))).toEqual(all);
  });
});

describe("sheetViewsPatch (D339)", () => {
  it("lays new views over a current sheet and reports the full set", () => {
    const fresh = makeViews("new");
    const { patch, complete } = sheetViewsPatch(makeAvatar({ sheetViews: makeViews() }), { left: fresh.left! });
    expect(patch.sheetViews?.left).toEqual(fresh.left);
    expect(patch.sheetViews?.front).toEqual(makeViews().front);
    expect(patch.sheetStale).toBe(false);
    expect(complete?.left).toEqual(fresh.left);
  });

  it("starts from nothing when the old views show an older front, so a gap stays a gap", () => {
    const fresh = makeViews("new");
    const { patch, complete } = sheetViewsPatch(
      makeAvatar({ sheetViews: makeViews(), sheetStale: true }),
      { front: fresh.front!, left: fresh.left!, right: fresh.right! },
    );
    expect(patch.sheetViews?.back).toBeNull();
    expect(complete).toBeNull();
  });

  it("clears the composed strip until the caller composes a new one", () => {
    expect(sheetViewsPatch(makeAvatar({ sheetViews: makeViews() }), {}).patch.sheet).toBeNull();
  });
});
