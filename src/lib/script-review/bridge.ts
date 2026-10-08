// src/lib/script-review/bridge.ts
import "server-only";
import type { Avatar } from "@/lib/avatars/schema";
import type { AvatarView } from "./constants";
import type { PanelSnapshot } from "./types";

// The two things spec 4 needs from spec 3 (Visualise), which is built in parallel. Both are stubs
// until spec 3 merges; replace each body with spec 3's own reader then (plan MP1, MP2). Nothing
// else in spec 4 reads panels or avatar views, so the merge touches only this file.

/** MP1 — "panels for a script: picked take URL per shot id". Spec 3 keeps panels and takes keyed by
 *  script and shot (its §9); the client only ever sees the picked take (its §6.6). Until spec 3
 *  lands there are none, and a full share carries none (spec 4 §0: panel comments attach to
 *  whatever panels exist). */
export async function getPickedPanels(_clientId: string, _scriptId: string): Promise<Record<string, PanelSnapshot>> {
  return {};
}

/** MP2 — "four views for an avatar". Spec 3 makes every sheet Front, Left, Right, Back (its §5.4).
 *  Today an avatar has a front image and one combined sheet, so only Front is a view of its own. */
export function avatarViewUrls(avatar: Avatar): Record<AvatarView, string | null> {
  return { front: avatar.front?.url ?? null, left: null, right: null, back: null };
}
