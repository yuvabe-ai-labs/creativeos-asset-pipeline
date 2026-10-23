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
/** A panel's File card before it is measured: a 2:3 panel (what GPT Image returns) at the input
 *  tier is 202 wide, with a header above the image and the filename and Open link below it —
 *  466 tall as measured on staging, 22 Oct 2026. Only the starting guess: settleFanOutRows
 *  lays rows out again from what renders. */
export const PANEL_CARD = { width: 202, height: 466 } as const;
/** Between a card and the panel under it, and between two panels side by side. */
export const PANEL_GAP = 24;
/** Empty canvas between one shot's row and the next. */
export const ROW_GAP = 96;
/** A row is never shorter than the chain Next grows along it: Image gen and Video gen with 9:16
 *  output are about 590 tall. */
export const CHAIN_ROW_MIN = 600;
/** Layout A (22 Oct 2026): one row per shot, its panel under it, and the guided chain (image
 *  prompt, image gen, video prompt, video gen) growing right along the row. The starting pitch,
 *  from the estimates: the tallest card plus its panel (a Multishot) and the gap. */
export const STORYBOARD_ROW_PITCH =
  Math.max(FAN_OUT_CARDS.multishot.height + PANEL_GAP + PANEL_CARD.height, CHAIN_ROW_MIN) + ROW_GAP;

/** How long a Fan out's rows keep settling to their measured sizes: long enough for every panel
 *  image to load, short enough that a later change (a collapse, an edit) never moves the rows. */
export const FAN_OUT_SETTLE_MS = 15_000;

/** The rows one Fan out made, in order, for settleFanOutRows. */
export type FanOutLayout = { top: number; rows: { shotId: string; panelIds: string[] }[] };
type Placed = { position: { x: number; y: number }; measured?: { width?: number; height?: number }; type?: string };

/**
 * Fan out places its rows from estimates, before anything has rendered. Once the cards are
 * measured (and a panel's image has loaded, which changes its card's height) this lays the same
 * rows out again from the real sizes: each panel centred just under its shot, and each row as
 * tall as its shot and panel, never less than the chain needs, with a gap before the next. Only
 * the nodes that are not already in place are returned, so a settled layout writes nothing.
 */
export function settleFanOutRows(nodes: ReadonlyMap<string, Placed>, layout: FanOutLayout): Map<string, { x: number; y: number }> {
  const moves = new Map<string, { x: number; y: number }>();
  const move = (id: string, node: Placed, x: number, y: number) => {
    if (Math.abs(node.position.x - x) > 0.5 || Math.abs(node.position.y - y) > 0.5) moves.set(id, { x, y });
  };
  let top = layout.top;
  for (const row of layout.rows) {
    const shot = nodes.get(row.shotId);
    if (!shot) continue;
    const estimate = shot.type === "multishot" ? FAN_OUT_CARDS.multishot : FAN_OUT_CARDS.shot;
    const shotWidth = shot.measured?.width ?? estimate.width;
    const shotHeight = shot.measured?.height ?? estimate.height;
    move(row.shotId, shot, shot.position.x, top);

    const panels = row.panelIds.flatMap((id) => {
      const node = nodes.get(id);
      return node ? [{ id, node, width: node.measured?.width ?? PANEL_CARD.width, height: node.measured?.height ?? PANEL_CARD.height }] : [];
    });
    const groupWidth = panels.reduce((sum, p) => sum + p.width, 0) + Math.max(0, panels.length - 1) * PANEL_GAP;
    let x = shot.position.x + (shotWidth - groupWidth) / 2;
    const panelTop = top + shotHeight + PANEL_GAP;
    for (const p of panels) {
      move(p.id, p.node, x, panelTop);
      x += p.width + PANEL_GAP;
    }
    const tallestPanel = Math.max(0, ...panels.map((p) => p.height));
    const rowHeight = Math.max(shotHeight + (panels.length ? PANEL_GAP + tallestPanel : 0), CHAIN_ROW_MIN);
    top += rowHeight + ROW_GAP;
  }
  return moves;
}

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
