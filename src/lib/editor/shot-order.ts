// Default reel order is shot order (spec §4): the script shot each clip came from. A Video Gen
// carries no shot data, so it is read off the nearest Shot or Multishot node upstream; a Dubbing
// node is ordered by the Video Gen it dubs.
import type { Edge } from "@xyflow/react";
import { findAncestorOfType } from "@/lib/canvas/graph";

/** The canvas node shape the editor's graph helpers need. AppNode satisfies it. */
export type EditorGraphNode = { id: string; type?: string; data: Record<string, unknown> };

/** Shot → prompt → image → motion prompt → video is four steps; one more covers a dub. */
const MAX_DEPTH = 5;

export function shotOrderOf(nodeId: string, nodes: EditorGraphNode[], edges: Edge[]): { order: number | null; label: string | null } {
  const self = nodes.find((n) => n.id === nodeId);
  const start =
    self?.type === "dubbing"
      ? (edges.find((e) => e.target === nodeId && nodes.find((n) => n.id === e.source)?.type === "video-gen")?.source ?? nodeId)
      : nodeId;
  const shot =
    findAncestorOfType(start, nodes, edges, "shot", MAX_DEPTH) ??
    findAncestorOfType(start, nodes, edges, "multishot", MAX_DEPTH);
  const order = typeof shot?.data.order === "number" ? shot.data.order : null;
  return { order, label: order === null ? null : `Shot ${order}` };
}
