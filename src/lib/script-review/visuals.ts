// src/lib/script-review/visuals.ts
import "server-only";
import { listAvatars } from "@/lib/db/avatars";
import type { Avatar } from "@/lib/avatars/schema";
import type { Script } from "@/lib/scripts/schema";
import { scopeIncludes, type ShareScope } from "./constants";
import { avatarViewUrls, getPickedPanels } from "./bridge";
import type { AvatarSnapshot, VersionVisuals } from "./types";

/** A cast member's avatar as the client will see it in this version: its views and its voice. */
export function toAvatarSnapshot(avatar: Avatar): AvatarSnapshot {
  const named = avatar.voice?.mode === "named" ? avatar.voice : null;
  const sampleUrl = avatar.voiceSample?.url ?? named?.previewUrl ?? null;
  return {
    avatarId: avatar.id,
    name: avatar.name,
    views: avatarViewUrls(avatar),
    voice: named || sampleUrl ? { name: named?.name ?? null, sampleUrl } : null,
  };
}

/** Spec 4 §3 step 3: what a share freezes besides the text, for what its scope includes. Only this
 *  client's live, ready avatars (listAvatars is scoped to the client and skips archived ones), so a
 *  draft or a foreign avatar id in the script never shows the client a face. */
export async function collectVisuals(clientId: string, script: Script, scope: ShareScope): Promise<VersionVisuals> {
  const visuals: VersionVisuals = { avatars: {}, panels: {} };
  if (scopeIncludes(scope, "avatars")) {
    const avatars = new Map((await listAvatars(clientId)).map((a) => [a.id, a]));
    for (const member of script.doc.cast) {
      const avatar = member.avatarId ? avatars.get(member.avatarId) : undefined;
      if (avatar && avatar.status === "ready") visuals.avatars[member.id] = toAvatarSnapshot(avatar);
    }
  }
  if (scopeIncludes(scope, "panels")) {
    const shotIds = new Set(script.doc.shots.map((s) => s.id));
    for (const [shotId, panel] of Object.entries(await getPickedPanels(clientId, script.id))) {
      if (shotIds.has(shotId)) visuals.panels[shotId] = panel;
    }
  }
  return visuals;
}
