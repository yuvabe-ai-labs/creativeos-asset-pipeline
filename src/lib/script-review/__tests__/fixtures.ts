// src/lib/script-review/__tests__/fixtures.ts
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import type { AvatarSnapshot, VersionContent } from "../types";

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
