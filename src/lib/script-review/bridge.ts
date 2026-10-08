// src/lib/script-review/bridge.ts
import "server-only";
import type { Avatar } from "@/lib/avatars/schema";
import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import { AVATAR_VIEWS, type AvatarView } from "./constants";
import type { PanelSnapshot } from "./types";

// The two things spec 4 reads from spec 3 (Visualise), now merged (plan MP1, MP2). Nothing else in
// spec 4 reads panels or avatar views.

/** MP1 — each shot's picked take with a finished image: what the client sees (spec 3 §6.6). A pick
 *  whose take failed or has no image freezes nothing, so the client sees "No panel" for it. */
export async function getPickedPanels(scriptId: string): Promise<Record<string, PanelSnapshot>> {
  const [picks, takes] = await Promise.all([listPanelPicks(scriptId), listPanelTakes(scriptId)]);
  const byId = new Map(takes.map((t) => [t.id, t]));
  const panels: Record<string, PanelSnapshot> = {};
  for (const [shotId, takeId] of Object.entries(picks)) {
    const take = byId.get(takeId);
    if (take?.status === "succeeded" && take.url) panels[shotId] = { takeId, url: take.url };
  }
  return panels;
}

/** MP2 — an avatar's four views (D340). An avatar from before D340 has only its front image, which
 *  then stands as the Front view. */
export function avatarViewUrls(avatar: Avatar): Record<AvatarView, string | null> {
  const views = avatar.sheetViews;
  return Object.fromEntries(
    AVATAR_VIEWS.map((view) => [view, views?.[view]?.url ?? (view === "front" ? avatar.front?.url ?? null : null)]),
  ) as Record<AvatarView, string | null>;
}
