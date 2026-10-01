import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { AvatarVoice } from "./schema";

// D298 — avatars on the canvas: the gallery's drag payload, and "the presenter of a script".
// Pure, so the store, the Script node and the routes of part 2 all read the same answer.

/** The gallery's avatar drag payload type — separate from the image payload, so an image drop
 *  never reads as an avatar and the other way round. */
export const AVATAR_DRAG_MIME = "application/x-creativeos-gallery-avatar";

export function parseAvatarDragPayload(raw: string): { avatarId: string } | null {
  try {
    const parsed = JSON.parse(raw) as { avatarId?: unknown };
    return typeof parsed.avatarId === "string" && parsed.avatarId ? { avatarId: parsed.avatarId } : null;
  } catch {
    return null;
  }
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
  "The new avatar is now this script's presenter, replacing the previous one.";

/** The voice an avatar speaks with, in a few words, for cards and tiles. */
export function avatarVoiceLine(voice: AvatarVoice | null): string {
  if (!voice) return "No voice";
  return voice.mode === "native" ? "Engine's own voice" : voice.name;
}
