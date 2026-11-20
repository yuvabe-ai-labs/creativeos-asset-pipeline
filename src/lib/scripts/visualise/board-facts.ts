import type { Script } from "../schema";
import type { BoardFacts, PanelState } from "../copilot/board-text";
import { PANEL_MODEL_ID } from "./constants";
import { castReadyForPanels, panelInputs, panelReferenceCap } from "./panel-inputs";
import type { PanelTake, VisualiseBoard } from "./schema";
import { panelView, type PanelStatus } from "./state";

// Piece 5.1 (D512) — the storyboard as the copilot is told it, from the same pure functions the
// board draws with (panelInputs, panelView), so what the copilot reads is what the page shows.

const STATE: Record<PanelStatus, PanelState> = {
  ready: "ready", out_of_date: "out_of_date", not_yet: "not_yet", failed: "failed", generating: "drawing", waiting: "waiting",
};

/** A shot's drawn versions, oldest first: "version 1" is the first one drawn. */
function versionsOf(takes: PanelTake[], shotId: string): PanelTake[] {
  return takes
    .filter((t) => t.shotId === shotId && t.status === "succeeded")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function boardFacts(script: Script, board: VisualiseBoard, now: number): BoardFacts {
  const { doc } = script;
  const avatars = new Map(board.avatars.map((a) => [a.id, a]));
  const cap = panelReferenceCap(PANEL_MODEL_ID);
  const shots = doc.shots.map((shot, i) => {
    const inputs = panelInputs({ doc, shot, avatars, kits: board.kits, cap });
    const view = panelView({ inputs, takes: board.takes.filter((t) => t.shotId === shot.id), pickId: board.picks[shot.id], drawing: false, now });
    const versions = versionsOf(board.takes, shot.id);
    const picked = versions.findIndex((t) => t.id === view.pick?.id);
    return { id: shot.id, label: `S${i + 1}`, panel: STATE[view.status], versions: versions.length, picked: picked < 0 ? null : picked + 1 };
  });
  const onScreen = new Set(doc.shots.flatMap((s) => s.onScreen));
  const used = (pick: (s: (typeof doc.shots)[number]) => string[]) => new Set(doc.shots.flatMap(pick));
  const usedLocations = used((s) => (s.location ? [s.location] : []));
  const usedProducts = used((s) => s.products);
  return {
    shots,
    castWithoutAvatar: doc.cast
      .filter((c) => onScreen.has(c.id) && !castReadyForPanels(c.avatarId ? avatars.get(c.avatarId) : undefined))
      .map((c) => c.name),
    withoutPicture: [
      ...doc.locations.filter((l) => usedLocations.has(l.id) && !l.image).map((l) => `${l.name} (location)`),
      ...doc.products.filter((p) => usedProducts.has(p.id) && p.images.length === 0).map((p) => `${p.name} (product)`),
    ],
  };
}

/** The copilot's picks ("version 2 of S3") as takes. A version that is not one of that shot's drawn
 *  takes is skipped, and the rest stand (plan Review Focus 4). */
export function resolvePicks(picks: { shotId: string; version: number }[], takes: PanelTake[]): { shotId: string; takeId: string }[] {
  return picks.flatMap(({ shotId, version }) => {
    const take = versionsOf(takes, shotId)[version - 1];
    return take ? [{ shotId, takeId: take.id }] : [];
  });
}
