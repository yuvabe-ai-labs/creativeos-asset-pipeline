import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { archiveRefusal, isVisualiseStage, withCastAvatar } from "../cast";

describe("isVisualiseStage", () => {
  it("allows Visualise work in Visualise and In review, nowhere else", () => {
    expect(isVisualiseStage("visualise")).toBe(true);
    expect(isVisualiseStage("in_review")).toBe(true);
    expect(isVisualiseStage("generate")).toBe(false);
    expect(isVisualiseStage("approved")).toBe(false);
  });
});

describe("archiveRefusal (D347)", () => {
  it("says nothing for an avatar no script uses", () => {
    expect(archiveRefusal([])).toBeNull();
  });

  it("names the one script that uses it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today"])).toBe(
      "This avatar is in Reel 01 · Golu starts today, so it can't be archived. Change it in that script first.",
    );
  });

  it("names every script when several use it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today", "Reel 16 · Harvest week"])).toBe(
      "This avatar is in 2 scripts (Reel 01 · Golu starts today, Reel 16 · Harvest week), so it can't be archived. Change it in those scripts first.",
    );
  });
});

const A = "7a2d3c4e-0000-4000-8000-000000000002";
const B = "7a2d3c4e-0000-4000-8000-000000000003";
type RawDoc = Record<string, unknown> & { cast: Record<string, unknown>[] };
const raw = () => structuredClone(reel01) as unknown as RawDoc;

describe("withCastAvatar", () => {
  it("writes only the one cast member's avatarId and leaves every other key as stored", () => {
    const doc: RawDoc = { ...raw(), notes: "kept by spec 2" };
    doc.cast[1] = { ...doc.cast[1], extra: "kept" };
    const result = withCastAvatar(doc, "meenakshi", A);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cast = result.doc.cast as Record<string, unknown>[];
    expect(cast[0].avatarId).toBe(A);
    expect(cast[1]).toEqual(doc.cast[1]);
    expect(result.doc.notes).toBe("kept by spec 2");
    expect(result.doc.shots).toEqual(doc.shots);
  });

  it("unlinks with null", () => {
    const doc = raw();
    doc.cast[0] = { ...doc.cast[0], avatarId: A };
    const result = withCastAvatar(doc, "meenakshi", null);
    expect(result.ok && (result.doc.cast as Record<string, unknown>[])[0].avatarId).toBeNull();
  });

  it("refuses an avatar another person in this script already has, and says who", () => {
    const doc = raw();
    doc.cast[0] = { ...doc.cast[0], avatarId: A };
    expect(withCastAvatar(doc, "husband", A)).toEqual({
      ok: false, status: 409, error: "Meenakshi already has this avatar in this script.",
    });
    expect(withCastAvatar(doc, "husband", B).ok).toBe(true);
  });

  it("is a 404 for a person the script does not have, and a 422 for a doc with no cast", () => {
    expect(withCastAvatar(raw(), "nobody", A)).toMatchObject({ ok: false, status: 404 });
    expect(withCastAvatar({ header: {} }, "meenakshi", A)).toMatchObject({ ok: false, status: 422 });
  });
});
