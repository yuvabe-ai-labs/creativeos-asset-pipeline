import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { ReelShot } from "@/lib/nodes/reel-script";
import { panelForRow, panelTitle, type StoryboardPanel } from "./storyboard";

/** Fan out's row pitch without a storyboard. */
export const SHOT_ROW_PITCH = 170;

/** The cards Fan out makes, as they render: a Shot (`w-56`) and a Multishot (`w-80`), at their
 *  usual height with a seeded description. */
export const FAN_OUT_CARDS = {
  shot: { width: 224, height: 280 },
  multishot: { width: 320, height: 360 },
} as const;
/** A panel's File card: a 9:16 panel at the input tier (media-fit.ts) is 176 wide and its
 *  image 309 tall under a ~36px header. Panels are 9:16 on every reel. */
export const PANEL_CARD = { width: 176, height: 345 } as const;
/** Between a card and the panel under it, and between two panels side by side. */
export const PANEL_GAP = 24;
/** Layout A (22 Oct 2026): one row per shot, its panel under it, and the guided chain (image
 *  prompt, image gen, video prompt, video gen) growing right along the row. The pitch clears the
 *  tallest card plus its panel (a Multishot: 360 + 24 + 345) and the chain's tallest card (Image
 *  gen or Video gen with 9:16 output, ~590), with room to spare between rows. */
export const STORYBOARD_ROW_PITCH = 800;

function extOf(url: string): string {
  return (url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
}

/**
 * D382 — a File node per approved panel of each NEW shot or multishot node, wired into its image
 * handle: on a Shot it grounds the Shot Composer, on a Multishot it is there to see (D383). The
 * node points at the panel's stored image, never a copy, and never-deleting it is node-file-
 * cleanup's rule (only a node's own upload slot is removed). Rows are matched by name; a row with
 * none, or a name the storyboard lacks, gets nothing. Nothing is wired past the shot (spec §2.5).
 */
export function storyboardPanelNodes(
  created: readonly AppNode[],
  rows: readonly ReelShot[],
  panels: readonly StoryboardPanel[] | undefined,
): { nodes: AppNode[]; edges: Edge[] } {
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  if (!panels || panels.length === 0) return { nodes, edges };

  for (const target of created) {
    if (target.type !== "shot" && target.type !== "multishot") continue;
    const indexes = (target.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [];
    const matched: StoryboardPanel[] = [];
    for (const index of indexes) {
      const panel = panelForRow(panels, rows[index]);
      if (panel && !matched.some((m) => m.shotId === panel.shotId)) matched.push(panel);
    }
    // Centred under the card, side by side when one node covers several rows.
    const card = FAN_OUT_CARDS[target.type];
    const groupWidth = matched.length * PANEL_CARD.width + (matched.length - 1) * PANEL_GAP;
    const left = target.position.x + (card.width - groupWidth) / 2;
    const top = target.position.y + card.height + PANEL_GAP;
    for (const [i, panel] of matched.entries()) {
      const ext = extOf(panel.url);
      const id = crypto.randomUUID();
      nodes.push({
        id,
        type: "file",
        position: { x: left + i * (PANEL_CARD.width + PANEL_GAP), y: top },
        data: {
          title: panelTitle(panel),
          filename: `${panel.label}-storyboard.${ext}`,
          fileExt: ext,
          fileKind: "image",
          fileUrl: panel.url,
        },
      } as AppNode);
      edges.push({ id: crypto.randomUUID(), source: id, target: target.id, targetHandle: "image" });
    }
  }
  return { nodes, edges };
}
