import { describe, it, expect } from "vitest";
import { rowToPanelTake, type PanelTakeRow } from "../rows";

const row: PanelTakeRow = {
  id: "t1", client_id: "c1", script_id: "s1", shot_id: "s06", generation_id: "g1",
  status: "succeeded", url: "https://x/p.png", width: 768, height: 1365,
  prompt: "p", prompt_edited: true, shot_key: "abcd1234",
  faces: { meenakshi: { avatarId: "a1", faceKey: "k1" } }, error: null, created_by: "u1",
  created_at: "2026-10-08T10:00:00.000Z", updated_at: "2026-10-08T10:01:00.000Z",
};

describe("rowToPanelTake", () => {
  it("maps the columns to the take", () => {
    expect(rowToPanelTake(row)).toEqual({
      id: "t1", scriptId: "s1", shotId: "s06", status: "succeeded", url: "https://x/p.png",
      width: 768, height: 1365, prompt: "p", promptEdited: true, shotKey: "abcd1234",
      faces: { meenakshi: { avatarId: "a1", faceKey: "k1" } }, error: null,
      createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:01:00.000Z",
    });
  });

  it("reads an unknown status as failed and malformed faces as none", () => {
    const take = rowToPanelTake({ ...row, status: "weird", faces: "nope" });
    expect(take.status).toBe("failed");
    expect(take.faces).toEqual({});
  });
});
