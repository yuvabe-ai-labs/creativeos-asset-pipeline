// src/lib/script-review/__tests__/wire.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  rowToComment, rowToEvent, rowToVersion, tokenRowToReview,
  type ScriptCommentRow, type ScriptEventRow, type ScriptTokenRow, type ScriptVersionRow,
} from "../wire";
import { avatarSnapshot, reelDoc } from "./fixtures";

const versionRow = (over: Partial<ScriptVersionRow> = {}): ScriptVersionRow => ({
  id: "v1", review_id: "r1", number: 1, scope: "avatars", doc: reelDoc(),
  visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} }, created_at: "2026-10-10T09:00:00.000Z",
  ...over,
});

const commentRow = (over: Partial<ScriptCommentRow> = {}): ScriptCommentRow => ({
  id: "c1", review_id: "r1", part_kind: "view", part_id: "meenakshi", part_view: "left", parent_id: null,
  author_kind: "client", author_name: "Priya", body: "Softer light", edited_by_name: null,
  resolved_at: null, resolved_by_name: null, created_at: "t", updated_at: "t", version: [{ number: 2 }],
  ...over,
});

describe("rowToVersion", () => {
  it("maps a valid row", () => {
    const v = rowToVersion(versionRow());
    expect(v).toMatchObject({ id: "v1", number: 1, scope: "avatars", sharedAt: "2026-10-10T09:00:00.000Z" });
    expect(v?.doc.shots).toHaveLength(14);
    expect(v?.visuals.avatars.meenakshi.views.front).toBe("https://cdn/front.png");
  });

  it("skips a row with a broken doc, visuals or scope, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToVersion(versionRow({ doc: { header: {} } }))).toBeNull();
    expect(rowToVersion(versionRow({ visuals: { avatars: [] } }))).toBeNull();
    expect(rowToVersion(versionRow({ scope: "full" }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("rowToComment", () => {
  it("maps the part columns and reads the version number from either embed shape", () => {
    expect(rowToComment(commentRow())).toMatchObject({
      id: "c1", versionNumber: 2, part: { kind: "view", castId: "meenakshi", view: "left" }, authorKind: "client",
    });
    expect(rowToComment(commentRow({ version: { number: 3 } }))?.versionNumber).toBe(3);
  });

  it("drops a row whose part or author kind is not one the app knows", () => {
    expect(rowToComment(commentRow({ part_kind: "pin" }))).toBeNull();
    expect(rowToComment(commentRow({ author_kind: "robot" }))).toBeNull();
    expect(rowToComment(commentRow({ version: null }))).toBeNull();
  });
});

describe("rowToEvent", () => {
  const row = (over: Partial<ScriptEventRow> = {}): ScriptEventRow => ({
    id: "e1", script_id: "s1", kind: "shared", version_number: 2, actor_kind: "team", actor_name: "Arun",
    detail: {
      scope: "panels",
      changes: [
        { part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" },
        { part: { kind: "pin" }, change: "revised", label: "x" },
      ],
    },
    created_at: "t",
    ...over,
  });

  it("reads scope and changes from detail, skipping a malformed change", () => {
    expect(rowToEvent(row())).toMatchObject({
      kind: "shared", versionNumber: 2, scope: "panels",
      changes: [{ part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" }],
    });
  });

  it("reads an event with no detail", () => {
    expect(rowToEvent(row({ kind: "reopened", version_number: null, detail: {} }))).toMatchObject({ scope: null, changes: [] });
  });

  it("drops an unknown kind", () => {
    expect(rowToEvent(row({ kind: "deleted" }))).toBeNull();
  });
});

describe("tokenRowToReview", () => {
  const row = (over: Partial<ScriptTokenRow> = {}): ScriptTokenRow => ({
    id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
    client_scripts: { stage: "in_review", archived_at: null },
    clients: [{ name: "Jackfruit365", organizations: { name: "Yuvabe Studios" } }],
    ...over,
  });

  it("carries the stage and the two names the page header shows", () => {
    expect(tokenRowToReview(row())).toMatchObject({ id: "r1", stage: "in_review", clientName: "Jackfruit365", orgName: "Yuvabe Studios" });
  });

  it("closes the link of an archived script (spec 4 §10)", () => {
    expect(tokenRowToReview(row({ client_scripts: { stage: "in_review", archived_at: "2026-10-12T00:00:00.000Z" } }))).toBeNull();
  });
});
