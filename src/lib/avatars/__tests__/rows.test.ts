import { describe, it, expect } from "vitest";
import { patchToRow, rowToAvatar, type AvatarRow } from "../rows";
import { makeAvatar, makeImage } from "./fixtures";

const row: AvatarRow = {
  id: "a1", client_id: "c1", name: "Riya", story: "",
  person_type: "specific",
  likeness_consent_by: "user-1", likeness_consent_at: "2026-09-30T10:05:00.000Z",
  front: makeImage(), sheet: makeImage(), sheet_stale: false,
  voice: null, voice_sample: null, status: "ready", archived_at: null,
  created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:05:00.000Z",
};

describe("rowToAvatar", () => {
  it("maps snake_case columns to the domain shape", () => {
    expect(rowToAvatar(row)).toEqual(makeAvatar());
  });
});

describe("patchToRow", () => {
  it("writes only the keys the patch carries, under their column names", () => {
    expect(patchToRow({ name: "Meera", sheetStale: true })).toEqual({ name: "Meera", sheet_stale: true });
  });

  it("keeps an explicit null, for personType", () => {
    expect(patchToRow({ personType: null })).toEqual({ person_type: null });
  });

  it("keeps explicit nulls for the consent fields", () => {
    expect(patchToRow({ likenessConsentBy: null, likenessConsentAt: null })).toEqual({
      likeness_consent_by: null, likeness_consent_at: null,
    });
  });
});
