// src/lib/script-review/__tests__/validate.test.ts
import { describe, it, expect } from "vitest";
import {
  parseApproval, parseNewScriptComment, parseReply, parseResolve, parseShare, parseStageMove,
} from "../validate";

describe("parseNewScriptComment", () => {
  const good = { authorName: " Priya ", body: " Can she wear blue? ", part: { kind: "shot", shotId: "s04" }, versionNumber: 2 };

  it("trims the name and the text and keeps the part and version", () => {
    expect(parseNewScriptComment(good)).toEqual({
      ok: true,
      value: { authorName: "Priya", body: "Can she wear blue?", part: { kind: "shot", shotId: "s04" }, versionNumber: 2 },
    });
  });

  it("refuses a blank comment, a missing part, and a missing or odd version", () => {
    expect(parseNewScriptComment({ ...good, body: "   " }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, part: { kind: "pin" } })).toEqual({ ok: false, error: "Say which part of the reel the comment is about." });
    expect(parseNewScriptComment({ ...good, versionNumber: undefined }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, versionNumber: 1.5 }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, versionNumber: 0 }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, authorName: "x".repeat(61) }).ok).toBe(false);
    expect(parseNewScriptComment(null).ok).toBe(false);
  });
});

describe("team bodies", () => {
  it("parseReply needs text", () => {
    expect(parseReply({ body: " Yes, blue works " })).toEqual({ ok: true, value: { body: "Yes, blue works" } });
    expect(parseReply({ body: "" }).ok).toBe(false);
  });

  it("parseResolve needs a boolean", () => {
    expect(parseResolve({ resolved: true })).toEqual({ ok: true, value: { resolved: true } });
    expect(parseResolve({ resolved: "yes" }).ok).toBe(false);
  });

  it("parseShare knows the three scopes", () => {
    expect(parseShare({ scope: "avatars" })).toEqual({ ok: true, value: { scope: "avatars" } });
    expect(parseShare({ scope: "everything" })).toEqual({ ok: false, error: "Choose what the share includes." });
  });

  it("parseStageMove knows the three team moves, never approve", () => {
    expect(parseStageMove({ move: "back_to_visualise" })).toEqual({ ok: true, value: { move: "back_to_visualise" } });
    expect(parseStageMove({ move: "approve" }).ok).toBe(false);
  });

  it("parseStageMove needs a share scope to move into In review, because that move also shares", () => {
    expect(parseStageMove({ move: "to_review", scope: "panels" })).toEqual({ ok: true, value: { move: "to_review", scope: "panels" } });
    expect(parseStageMove({ move: "to_review" })).toEqual({ ok: false, error: "Choose what to share with the client." });
    expect(parseStageMove({ move: "to_review", scope: "everything" }).ok).toBe(false);
  });
});

describe("parseApproval", () => {
  it("needs the typed name and the version on screen", () => {
    expect(parseApproval({ approverName: "Priya", versionNumber: 3 })).toEqual({ ok: true, value: { approverName: "Priya", versionNumber: 3 } });
    expect(parseApproval({ approverName: "", versionNumber: 3 }).ok).toBe(false);
    expect(parseApproval({ approverName: "Priya" }).ok).toBe(false);
  });
});
