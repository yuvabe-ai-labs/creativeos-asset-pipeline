// src/lib/script-review/__tests__/constants.test.ts
import { describe, it, expect } from "vitest";
import * as avatarConstants from "@/lib/avatars/constants";
import {
  AVATAR_VIEWS, AVATAR_VIEW_LABEL, isShareScope, isTeamStageMove, scopeIncludes, teamMovesFrom, TEAM_STAGE_MOVES,
} from "../constants";

describe("share scopes", () => {
  it("knows the three scopes and nothing else", () => {
    expect(["script", "avatars", "panels"].every(isShareScope)).toBe(true);
    expect(isShareScope("full")).toBe(false);
    expect(isShareScope(undefined)).toBe(false);
  });

  it("each scope includes what the spec says", () => {
    expect(scopeIncludes("script", "avatars")).toBe(false);
    expect(scopeIncludes("avatars", "avatars")).toBe(true);
    expect(scopeIncludes("avatars", "panels")).toBe(false);
    expect(scopeIncludes("panels", "avatars")).toBe(true);
    expect(scopeIncludes("panels", "panels")).toBe(true);
  });
});

describe("team stage moves", () => {
  it("only these three moves exist (spec 4 §3, §8)", () => {
    expect(Object.keys(TEAM_STAGE_MOVES).sort()).toEqual(["back_to_visualise", "reopen", "to_review"]);
    expect(isTeamStageMove("approve")).toBe(false);
  });

  it("offers each move only from its stage", () => {
    expect(teamMovesFrom("generate")).toEqual([]);
    expect(teamMovesFrom("visualise")).toEqual(["to_review"]);
    expect(teamMovesFrom("in_review")).toEqual(["back_to_visualise"]);
    expect(teamMovesFrom("approved")).toEqual(["reopen"]);
  });

  it("never labels the reopen as spec 3's Reopen", () => {
    expect(TEAM_STAGE_MOVES.reopen.label).toBe("Reopen to Visualise");
  });
});

describe("the four views", () => {
  it("are spec 3's list and labels, not a copy (CLAUDE.md: import, don't redefine)", () => {
    expect(AVATAR_VIEWS).toBe(avatarConstants.AVATAR_VIEWS);
    expect(AVATAR_VIEW_LABEL).toBe(avatarConstants.AVATAR_VIEW_LABELS);
  });
});
