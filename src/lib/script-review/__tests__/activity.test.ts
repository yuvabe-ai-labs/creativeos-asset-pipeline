// src/lib/script-review/__tests__/activity.test.ts
import { describe, it, expect } from "vitest";
import { buildActivity } from "../activity";
import { comment, event } from "./fixtures";

describe("buildActivity (spec 4 §7)", () => {
  it("says what a first share included", () => {
    expect(buildActivity([event()], []).map((l) => l.text)).toEqual(["Shared, version 1 · the script"]);
  });

  it("puts what changed before the share that carried it, linking every part still there", () => {
    const lines = buildActivity(
      [
        event(),
        event({
          id: "e2", versionNumber: 2, scope: "panels", createdAt: "2026-10-11T09:00:00.000Z",
          changes: [
            { part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" },
            { part: { kind: "shot", shotId: "s09" }, change: "removed", label: "S9" },
          ],
        }),
      ],
      [],
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Shared, version 1 · the script",
      "S1 revised · S9 removed",
      "Shared again, version 2 · the script, avatars and panels",
    ]);
    expect(lines[1].links).toEqual([{ label: "S1", part: { kind: "shot", shotId: "s01" } }]);
  });

  it("counts the client's comments per version, by name, and leaves out team replies", () => {
    const lines = buildActivity(
      [event()],
      [
        comment({ id: "a", authorName: "Priya", createdAt: "2026-10-10T10:00:00.000Z" }),
        comment({ id: "b", authorName: "Ravi", createdAt: "2026-10-10T11:00:00.000Z" }),
        comment({ id: "c", authorName: "Priya", createdAt: "2026-10-10T12:00:00.000Z" }),
        comment({ id: "r", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: "2026-10-10T13:00:00.000Z" }),
      ],
    );
    expect(lines.map((l) => l.text)).toEqual(["Shared, version 1 · the script", "3 comments, by Priya and Ravi"]);
    expect(lines[1].at).toBe("2026-10-10T12:00:00.000Z");
  });

  it("reads Approved › Reopened › Approved, oldest first, and leaves out the move into In review", () => {
    const lines = buildActivity(
      [
        event({ id: "m", kind: "moved_to_review", versionNumber: null, scope: null, createdAt: "2026-10-09T09:00:00.000Z" }),
        event({ id: "s1", scope: "panels" }),
        event({ id: "a1", kind: "approved", actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-10T12:00:00.000Z" }),
        event({ id: "r", kind: "reopened", versionNumber: null, scope: null, createdAt: "2026-10-12T09:00:00.000Z" }),
        event({ id: "s2", versionNumber: 2, scope: "panels", createdAt: "2026-10-12T10:00:00.000Z" }),
        event({ id: "a2", kind: "approved", versionNumber: 2, actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-12T11:00:00.000Z" }),
        event({ id: "b", kind: "moved_back", versionNumber: null, scope: null, createdAt: "2026-10-10T11:00:00.000Z" }),
      ],
      [],
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Shared, version 1 · the script, avatars and panels",
      "Moved back to Visualise by Arun",
      "Approved by Priya",
      "Reopened by Arun",
      "Shared again, version 2 · the script, avatars and panels",
      "Approved by Priya",
    ]);
  });
});
