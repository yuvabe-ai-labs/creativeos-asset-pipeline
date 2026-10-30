import type { ScriptDoc } from "./schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import type { ReelShot } from "@/lib/nodes/reel-script";

// D380 — a shot's name on the canvas. The copilot already calls its shots S1, S2… everywhere the
// team reads them; the canvas copy prints the same names into the script text, so they survive
// every edit, and a parsed row finds its storyboard panel by its name.

/** The name of the shot at `index` (zero-based) in the script's order. */
export const shotLabel = (index: number): string => `S${index + 1}`;

/** D381 — one storyboard panel as it travels to the canvas: its shot's name, beat and id, and the
 *  stored image (never copied; deleting a canvas node never deletes it). */
export type StoryboardPanel = {
  label: string;
  beat: string;
  shotId: string;
  url: string;
  /** D454 — the take it is: how Fan out finds the generation that drew it, for its Composite's v1. */
  takeId: string;
};

/** What a Script node keeps: the panels, frozen when the script was added. */
export type ScriptStoryboard = { scriptId: string; panels: StoryboardPanel[] };

/** The picked panels in the script's order, each named as `printScript` names its shot. A
 *  panel for a shot the script no longer has is left out (spec 3 keeps orphaned takes). */
export function storyboardFor(doc: ScriptDoc, panels: Record<string, PanelSnapshot>): StoryboardPanel[] {
  return doc.shots.flatMap((shot, i) => {
    const panel = panels[shot.id];
    return panel ? [{ label: shotLabel(i), beat: shot.beat.trim(), shotId: shot.id, url: panel.url, takeId: panel.takeId }] : [];
  });
}

/** Spec A4 — "S3 · HOOK — storyboard": the panel's name on the canvas and in the gallery. */
export function panelTitle(panel: Pick<StoryboardPanel, "label" | "beat">): string {
  const beat = panel.beat.trim().toUpperCase();
  return `${beat ? `${panel.label} · ${beat}` : panel.label} — storyboard`;
}

const nameKey = (label: string | undefined): string => (label ?? "").trim().toUpperCase();

/** The panel for a parsed row, by the row's name. A row with no name, or a name the storyboard
 *  does not have, gets none — an edit that drops or renames a shot just unlinks it (spec §3). */
export function panelForRow(
  panels: readonly StoryboardPanel[] | undefined,
  row: Pick<ReelShot, "label"> | undefined,
): StoryboardPanel | undefined {
  const key = nameKey(row?.label);
  if (!key || !panels) return undefined;
  return panels.find((p) => nameKey(p.label) === key);
}
