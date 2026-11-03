import type { Edge, XYPosition } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { AvatarVoice } from "./schema";

// D298 — avatars on the canvas: the gallery's drag payload, and "the presenter of a script".
// Pure, so the store, the Script node and the routes of part 2 all read the same answer.

/** The gallery's avatar drag payload type — separate from the image payload, so an image drop
 *  never reads as an avatar and the other way round. */
/** D460 — how far left of its Script a presenter avatar sits: its widest card (280, the input
 *  tier) plus a gap, so it never overlaps the Script card (it was 240, and a 280-wide card covered
 *  the script by 40). Its right edge lines up with Fan out's asset column under it. */
export const PRESENTER_OFFSET_X = 320;
/** A presenter avatar card before it is measured: 280 wide with a 2:3 face and its footer. */
export const PRESENTER_CARD_HEIGHT = 520;

/** The gap between stacked avatar cards, and between the Brand KB and the card under it. */
const AVATAR_STACK_GAP = 40;
/** A presenter avatar card's width, and the Brand KB card before it is measured. */
const AVATAR_CARD_WIDTH = 280;
const KB_CARD = { width: 176, height: 140 };

type Placed = { position: XYPosition; measured?: { width?: number; height?: number } };

/** D473 — the Brand KB wired into this script, if any. */
export function scriptKbNode<N extends { id: string; type?: string }>(
  scriptId: string, nodes: readonly N[], edges: readonly Edge[],
): N | null {
  const sources = new Set(edges.filter((e) => e.target === scriptId).map((e) => e.source));
  return nodes.find((n) => n.type === "kb" && sources.has(n.id)) ?? null;
}

/** D473 — the lead's slot: centred under the script's Brand KB (a 280 card lined up with the 176 KB
 *  on the left would touch the Script), else beside the script. */
export function leadAvatarPosition(script: XYPosition, kb: Placed | null): XYPosition {
  if (!kb) return { x: script.x - PRESENTER_OFFSET_X, y: script.y };
  const width = kb.measured?.width ?? KB_CARD.width;
  const height = kb.measured?.height ?? KB_CARD.height;
  return { x: kb.position.x + (width - AVATAR_CARD_WIDTH) / 2, y: kb.position.y + height + AVATAR_STACK_GAP };
}

/** D473 — where the script's other cast go: stacked down from under the lead's slot. */
export function castAvatarPosition(script: XYPosition, kb: Placed | null, index: number): XYPosition {
  const lead = leadAvatarPosition(script, kb);
  return { x: lead.x, y: lead.y + (index + 1) * (PRESENTER_CARD_HEIGHT + AVATAR_STACK_GAP) };
}

/** D473, amending D460 — where Fan out's asset column goes: left of the avatar stack, from level
 *  with the script, so a long cast never pushes it down or sits under it. With no KB and no avatar
 *  in the lead's slot there is no stack, and it sits beside the script. */
export function assetColumnAnchor(
  script: XYPosition, kb: Placed | null, nodes: readonly Pick<AppNode, "type" | "position">[], gap: number,
): { right: number; top: number } {
  const slot = leadAvatarPosition(script, kb);
  const stacked = kb !== null || nodes.some((n) => n.type === "avatar" && n.position.x === slot.x);
  return { right: (stacked ? slot.x : script.x) - gap, top: script.y };
}

export const AVATAR_DRAG_MIME = "application/x-creativeos-gallery-avatar";

export function parseAvatarDragPayload(raw: string): { avatarId: string } | null {
  try {
    const parsed = JSON.parse(raw) as { avatarId?: unknown };
    return typeof parsed.avatarId === "string" && parsed.avatarId ? { avatarId: parsed.avatarId } : null;
  } catch {
    return null;
  }
}

/** Whether this avatar already has a node on the canvas. */
export function avatarOnCanvas(avatarId: string, nodes: readonly AppNode[]): boolean {
  return nodes.some((n) => n.type === "avatar" && (n.data as { avatarId?: unknown }).avatarId === avatarId);
}

function avatarNodeIds(nodes: readonly AppNode[]): Set<string> {
  return new Set(nodes.filter((n) => n.type === "avatar").map((n) => n.id));
}

/** The script's presenter edge: the newest avatar edge into it. A script has one presenter, but
 *  older data or another path could leave several — the last one added wins. */
export function presenterEdge(scriptId: string, nodes: readonly AppNode[], edges: readonly Edge[]): Edge | null {
  const avatars = avatarNodeIds(nodes);
  for (let i = edges.length - 1; i >= 0; i -= 1) {
    const e = edges[i];
    if (e.target === scriptId && avatars.has(e.source)) return e;
  }
  return null;
}

/** The presenter's avatar id, read from its node. */
export function presenterAvatarId(scriptId: string, nodes: readonly AppNode[], edges: readonly Edge[]): string | null {
  const e = presenterEdge(scriptId, nodes, edges);
  if (!e) return null;
  const node = nodes.find((n) => n.id === e.source);
  const avatarId = (node?.data as { avatarId?: unknown } | undefined)?.avatarId;
  return typeof avatarId === "string" && avatarId ? avatarId : null;
}

/** The edges a new avatar → script connection replaces: that script's other avatar edges. Empty
 *  for any other connection, and for the same avatar connecting again. */
export function replacedPresenterEdges(
  nodes: readonly AppNode[], edges: readonly Edge[], source: string, target: string,
): Edge[] {
  const avatars = avatarNodeIds(nodes);
  const targetIsScript = nodes.some((n) => n.id === target && n.type === "script");
  if (!avatars.has(source) || !targetIsScript) return [];
  return edges.filter((e) => e.target === target && e.source !== source && avatars.has(e.source));
}

export const PRESENTER_REPLACED_MESSAGE =
  "The new avatar replaces the previous one on this script.";

/** The voice an avatar speaks with, in a few words, for cards and tiles. */
export function avatarVoiceLine(voice: AvatarVoice | null): string {
  if (!voice) return "No voice";
  return voice.mode === "native" ? "Chosen for me" : voice.name;
}
