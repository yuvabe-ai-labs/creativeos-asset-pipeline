// src/lib/script-review/__tests__/fixtures.ts
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import type { AvatarSnapshot, ScriptComment, ScriptReviewEvent, VersionContent } from "../types";

export const AVATAR_ID = "7a2d3c4e-0000-4000-8000-000000000002";

/** A fresh, validated Reel 01 (14 shots s01–s14; cast meenakshi (lead) and husband). */
export function reelDoc(): ScriptDoc {
  return scriptDocSchema.parse(structuredClone(reel01));
}

export function avatarSnapshot(views: Partial<AvatarSnapshot["views"]> = { front: "https://cdn/front.png" }): AvatarSnapshot {
  return {
    avatarId: AVATAR_ID,
    name: "Meenakshi",
    views: { front: null, left: null, right: null, back: null, ...views },
    voice: null,
  };
}

export function content(over: Partial<VersionContent> = {}): VersionContent {
  return { scope: "script", doc: reelDoc(), visuals: { avatars: {}, panels: {} }, ...over };
}

export function comment(over: Partial<ScriptComment> = {}): ScriptComment {
  return {
    id: "c1", versionNumber: 1, part: { kind: "context" }, parentId: null,
    authorKind: "client", authorName: "Priya", body: "Looks good",
    editedByName: null, resolvedAt: null, resolvedByName: null,
    createdAt: "2026-10-10T10:00:00.000Z", updatedAt: "2026-10-10T10:00:00.000Z",
    ...over,
  };
}

export function event(over: Partial<ScriptReviewEvent> = {}): ScriptReviewEvent {
  return {
    id: "e1", kind: "shared", versionNumber: 1, actorKind: "team", actorName: "Arun",
    scope: "script", changes: [], createdAt: "2026-10-10T09:00:00.000Z",
    ...over,
  };
}
