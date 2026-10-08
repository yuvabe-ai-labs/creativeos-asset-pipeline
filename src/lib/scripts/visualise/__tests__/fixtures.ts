import { scriptDocSchema, type Script, type ScriptDoc } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { makeAvatar, makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { Avatar } from "@/lib/avatars/schema";
import type { PanelTake } from "../schema";

export const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
export const MEENAKSHI_AVATAR = "7a2d3c4e-0000-4000-8000-000000000002";
export const HUSBAND_AVATAR = "7a2d3c4e-0000-4000-8000-000000000003";

/** The seeded Reel 01, as the app reads it: Meenakshi (lead) and her husband, 14 shots. */
export function reel01Doc(): ScriptDoc {
  return scriptDocSchema.parse(structuredClone(reel01));
}

/** Reel 01 with both people linked to an avatar. */
export function linkedDoc(): ScriptDoc {
  const doc = reel01Doc();
  doc.cast = doc.cast.map((c) => ({ ...c, avatarId: c.id === "meenakshi" ? MEENAKSHI_AVATAR : HUSBAND_AVATAR }));
  return doc;
}

export function makeScript(doc: ScriptDoc = linkedDoc(), stage: Script["stage"] = "visualise"): Script {
  return {
    id: SCRIPT_ID, clientId: "c1", stage, doc, approvedAt: null,
    createdAt: "2026-10-08T09:00:00.000Z", updatedAt: "2026-10-08T09:00:00.000Z",
  };
}

/** A saved avatar with a current four-view sheet; `prefix` makes its image urls its own. */
export function readyAvatar(id: string, prefix: string, over: Partial<Avatar> = {}): Avatar {
  return makeAvatar({
    id, name: prefix, status: "ready", sheetViews: makeViews(prefix),
    front: { ...makeAvatar().front!, url: `https://storage.googleapis.com/b/${prefix}-portrait.png` },
    ...over,
  });
}

export function avatarMap(...avatars: Avatar[]): Map<string, Avatar> {
  return new Map(avatars.map((a) => [a.id, a]));
}

export function makeTake(over: Partial<PanelTake> = {}): PanelTake {
  return {
    id: "t1", scriptId: SCRIPT_ID, shotId: "s01", status: "succeeded",
    url: "https://storage.googleapis.com/b/t1.png", width: 768, height: 1365,
    prompt: "p", promptEdited: false, shotKey: "k", faces: {}, error: null,
    createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z",
    ...over,
  };
}
