// src/lib/script-review/__tests__/assemble.test.ts
import { describe, it, expect } from "vitest";
import {
  approvalOf, assemblePublic, assembleTeam, canApprove, commentsOpen, feedbackCount, tallyFeedback, type ReviewState,
} from "../assemble";
import type { ScriptVersion } from "../wire";
import { comment, content, event } from "./fixtures";

const version = (number: number, over: Partial<ScriptVersion> = {}): ScriptVersion => ({
  ...content(), id: `v${number}`, number, sharedAt: `2026-10-1${number}T09:00:00.000Z`, ...over,
});

const state = (over: Partial<ReviewState> = {}): ReviewState => ({ versions: [], comments: [], events: [], ...over });

describe("approval of the version on screen (spec 4 §8)", () => {
  const events = [
    event({ id: "s1", scope: "panels" }),
    event({ id: "a1", kind: "approved", actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-11T12:00:00.000Z" }),
    event({ id: "r", kind: "reopened", versionNumber: null, scope: null }),
    event({ id: "s2", versionNumber: 2, scope: "panels" }),
  ];

  it("binds to the version it was given on", () => {
    expect(approvalOf(events, 1)).toEqual({ byName: "Priya", at: "2026-10-11T12:00:00.000Z" });
  });

  it("is gone for a new share after a reopen, so the link takes comments again", () => {
    expect(approvalOf(events, 2)).toBeNull();
    expect(commentsOpen(version(2), approvalOf(events, 2))).toBe(true);
    expect(commentsOpen(version(1), approvalOf(events, 1))).toBe(false);
  });

  it("offers Approve only on a full share, In review, once", () => {
    const full = version(1, { scope: "panels" });
    expect(canApprove("in_review", full, null)).toBe(true);
    expect(canApprove("in_review", version(1, { scope: "avatars" }), null)).toBe(false);
    expect(canApprove("visualise", full, null)).toBe(false);
    expect(canApprove("in_review", full, { byName: "Priya", at: "t" })).toBe(false);
    expect(canApprove("in_review", null, null)).toBe(false);
  });
});

describe("assemblePublic", () => {
  it("is null until something was shared", () => {
    expect(assemblePublic(state(), { stage: "in_review", fromName: "Yuvabe Studios", forName: "Jackfruit365" })).toBeNull();
  });

  it("shows the latest version, without its row id", () => {
    const v1 = version(1);
    const v2 = version(2);
    v2.doc.shots[0].visual = "Version two's opening";
    const out = assemblePublic(state({ versions: [v1, v2], comments: [comment()] }), {
      stage: "in_review", fromName: "Yuvabe Studios", forName: "Jackfruit365",
    })!;
    expect(out.version.number).toBe(2);
    expect(out.version.doc.shots[0].visual).toBe("Version two's opening");
    expect(out.fromName).toBe("Yuvabe Studios");
    expect(out.version).not.toHaveProperty("id");
  });
});

describe("assembleTeam", () => {
  it("places removed-shot comments against the team's live script", () => {
    const live = content().doc;
    live.shots = live.shots.filter((s) => s.id !== "s09");
    const out = assembleTeam(state({ versions: [version(1)] }), { stage: "visualise", shareToken: "6f1c", liveDoc: live });
    expect(Object.keys(out.removedShots)).toEqual(["s09"]);
    expect(out.latest).toEqual({ number: 1, scope: "script", sharedAt: "2026-10-11T09:00:00.000Z" });
  });

  it("has no link and no version before the first share", () => {
    const out = assembleTeam(state({ events: [event({ kind: "moved_to_review", versionNumber: null, scope: null })] }), {
      stage: "in_review", shareToken: null, liveDoc: content().doc,
    });
    expect(out).toMatchObject({ stage: "in_review", shareToken: null, latest: null, commentsOpen: false, feedbackCount: 0 });
  });
});

describe("feedbackCount (spec 4 §6)", () => {
  it("counts client comments and approvals, never the team's replies", () => {
    const comments = [comment({ id: "a" }), comment({ id: "b" }), comment({ id: "r", parentId: "a", authorKind: "team" })];
    const events = [event(), event({ id: "ap", kind: "approved", actorKind: "client" })];
    expect(feedbackCount(comments, events)).toBe(3);
  });
});

describe("tallyFeedback", () => {
  it("adds a script's client comments and approvals, per script", () => {
    expect(tallyFeedback(["s1", "s1", "s2"], ["s1"])).toEqual({ s1: 3, s2: 1 });
    expect(tallyFeedback([], [])).toEqual({});
  });
});
