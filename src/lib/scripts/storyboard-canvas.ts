import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { ReelShot } from "@/lib/nodes/reel-script";
import { panelForRow, panelTitle, type StoryboardPanel } from "./storyboard";

/** Fan out's row pitch, and with a storyboard the pitch that leaves room for a panel under each
 *  shot (a Shot card ~150px, a File card with its thumbnail ~130px). */
export const SHOT_ROW_PITCH = 170;
export const STORYBOARD_ROW_PITCH = 360;
/** How far below its shot a panel sits — under the shot's bottom image handle. */
export const PANEL_DY = 190;
/** A second panel on one node (a generation covering several rows) sits beside the first. */
const PANEL_DX = 220;

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
    const placed = new Set<string>();
    for (const index of indexes) {
      const panel = panelForRow(panels, rows[index]);
      if (!panel || placed.has(panel.shotId)) continue;
      const ext = extOf(panel.url);
      const id = crypto.randomUUID();
      nodes.push({
        id,
        type: "file",
        position: { x: target.position.x + placed.size * PANEL_DX, y: target.position.y + PANEL_DY },
        data: {
          title: panelTitle(panel),
          filename: `${panel.label}-storyboard.${ext}`,
          fileExt: ext,
          fileKind: "image",
          fileUrl: panel.url,
        },
      } as AppNode);
      edges.push({ id: crypto.randomUUID(), source: id, target: target.id, targetHandle: "image" });
      placed.add(panel.shotId);
    }
  }
  return { nodes, edges };
}
