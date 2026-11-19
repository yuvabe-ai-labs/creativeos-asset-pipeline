import type { Edge, XYPosition } from "@xyflow/react";
import type { CompositeNodeData } from "@/lib/canvas-nodes";
import { mentionDialect } from "@/lib/nodes/prompt-token-dialect";
import type { ScriptDoc } from "./schema";
import { shotLabel } from "./storyboard";
import { nameKey, scriptAssetKey, scriptAssetNodeIds, type ScriptCanvasAssets } from "./asset-canvas";
import { PANEL_CARD, PANEL_GAP } from "./storyboard-canvas";

// D503 — Fan out's shot still: for each storyboard panel it places, one Composite to the panel's
// right, wired from that panel and from what the script lists for that shot (the on-screen people
// whose avatar node is on the canvas, its location, its products), with an instruction that names
// each by its chip. It is connected to nothing downstream and is never generated on its own: the
// operator reads the instruction, presses Generate, and wires the result where it is wanted.

/** Who is on screen in each shot, by row name ("S3"), as the latest script says: only cast
 *  members with an avatar, since only an avatar can be wired. */
export type ShotOnScreen = Record<string, { avatarId: string; name: string }[]>;

/** D503 — read on the server from the latest script when Fan out asks for its panels. */
export function shotOnScreen(doc: Pick<ScriptDoc, "cast" | "shots">): ShotOnScreen {
  const out: ShotOnScreen = {};
  doc.shots.forEach((shot, i) => {
    const people = doc.cast
      .filter((c) => c.avatarId && shot.onScreen.includes(c.id))
      .map((c) => ({ avatarId: c.avatarId!, name: c.name }));
    if (people.length > 0) out[shotLabel(i)] = people;
  });
  return out;
}

const MENTION = mentionDialect();
type Chip = { id: string; label: string };
const chip = (c: Chip) => MENTION.tokenForId(c.id, c.label);
const list = (chips: Chip[]) =>
  chips.length <= 1 ? chips.map(chip).join("") : `${chips.slice(0, -1).map(chip).join(", ")} and ${chip(chips[chips.length - 1])}`;

/** The still's starting instruction: every wired input by its chip, so the operator edits a
 *  sentence that already says what each picture is. */
export function stillInstruction(parts: { storyboard: Chip; avatars: Chip[]; location: Chip | null; products: Chip[] }): string {
  const clauses = [
    ...(parts.avatars.length > 0 ? [`using ${list(parts.avatars)}`] : []),
    ...(parts.location ? [`in the location ${chip(parts.location)}`] : []),
    ...(parts.products.length > 0 ? [`with the product${parts.products.length > 1 ? "s" : ""} ${list(parts.products)}`] : []),
  ];
  return `Using the storyboard ${chip(parts.storyboard)}, create the real scene${clauses.length > 0 ? ` ${clauses.join(", ")}` : ""}.`;
}

/** "S1 · HOOK — storyboard" → "S1 · HOOK — still". */
export const stillTitle = (panelTitle: string) => `${panelTitle.replace(/\s*—\s*storyboard$/i, "")} — still`;

type CanvasNode = { id: string; type?: string; position: XYPosition; measured?: { width?: number; height?: number }; data: unknown };
export type ShotStillNode = { id: string; type: "composite"; position: XYPosition; data: CompositeNodeData };

/**
 * One still per panel, to the right of its row's panels (a Multishot row's panels side by side,
 * then their stills in the same order). Each row's `panels` are the storyboard Composites the
 * server made, by node id and row name; a panel no longer on the canvas gets no still. A person,
 * location or product whose node is not on the canvas is left out (D503: never added here).
 */
export function shotStillNodes(args: {
  rows: { panels: { nodeId: string; label: string }[] }[];
  nodes: readonly CanvasNode[];
  assets: ScriptCanvasAssets | undefined;
  onScreen: ShotOnScreen;
  newId: () => string;
}): { nodes: ShotStillNode[]; edges: Edge[]; rows: { stillIds: string[] }[] } {
  const { rows, nodes, assets, onScreen, newId } = args;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const avatarNode = new Map<string, string>();
  for (const n of nodes) {
    const avatarId = n.type === "avatar" ? (n.data as { avatarId?: string }).avatarId : undefined;
    if (avatarId && !avatarNode.has(avatarId)) avatarNode.set(avatarId, n.id);
  }
  const assetNode = assets ? scriptAssetNodeIds(nodes, assets.scriptId) : new Map<string, string>();
  const assetChip = (kind: "product" | "location", id: string, name: string): Chip | null => {
    const nodeId = assetNode.get(scriptAssetKey(kind, id));
    if (!nodeId) return null;
    // A generated plate is a Composite, and `@` labels it as one.
    const type = byId.get(nodeId)?.type === "composite" ? "Composite" : kind === "product" ? "Product" : "Location";
    return { id: nodeId, label: `${type}: ${name}` };
  };

  const stills: ShotStillNode[] = [];
  const edges: Edge[] = [];
  const outRows = rows.map((row) => {
    const panels = row.panels.flatMap((p) => {
      const node = byId.get(p.nodeId);
      return node ? [{ ...p, node }] : [];
    });
    const last = panels[panels.length - 1]?.node;
    const step = PANEL_CARD.width + PANEL_GAP;
    let x = last ? last.position.x + (last.measured?.width ?? PANEL_CARD.width) + PANEL_GAP : 0;
    const stillIds = panels.map(({ label, node: panel }) => {
      const key = nameKey(label);
      const title = String((panel.data as { title?: string }).title ?? label);
      const picks = assets?.picks[key];
      const avatars = (onScreen[key] ?? []).flatMap((p): Chip[] => {
        const id = avatarNode.get(p.avatarId);
        return id ? [{ id, label: `Avatar: ${p.name}` }] : [];
      });
      const place = picks?.location ? assets?.locations.find((l) => l.id === picks.location) : undefined;
      const location = place ? assetChip("location", place.id, place.name) : null;
      const products = (picks?.products ?? []).flatMap((pid) => {
        const p = assets?.products.find((x) => x.id === pid);
        const c = p ? assetChip("product", p.id, p.name) : null;
        return c ? [c] : [];
      });
      const storyboard = { id: panel.id, label: `Composite: ${title}` };

      const id = newId();
      stills.push({
        id,
        type: "composite",
        position: { x, y: panel.position.y },
        data: { title: stillTitle(title), instruction: stillInstruction({ storyboard, avatars, location, products }) },
      });
      x += step;
      // In the order the instruction reads them.
      for (const source of [storyboard, ...avatars, ...(location ? [location] : []), ...products]) {
        edges.push({ id: newId(), source: source.id, target: id });
      }
      return id;
    });
    return { stillIds };
  });
  return { nodes: stills, edges, rows: outRows };
}
