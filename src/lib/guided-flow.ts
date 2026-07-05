// Pure guided next-node flow logic (D36). Uses ONLY `import type` from React Flow, so it
// is safe to import anywhere. The whole reel pipeline progression is data here; nothing
// runs a model (D11) — the store action just creates/connects/places the next node.
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { findAncestorOfType } from "@/lib/canvas/graph";

const NEXT_DX = 360;   // horizontal gap to the next node (matches fanOutShots)
const ROW_DY = 170;    // vertical nudge when a spot is taken
const BOX_W = 300;     // approximate node footprint for overlap checks
const BOX_H = 150;

export type GuidedGate = { enabled: boolean; nudge?: string };

/** Drop the next node to the right of `source`, nudging down until the spot is clear. */
export function placeNextTo(source: AppNode, nodes: AppNode[]): { x: number; y: number } {
  const x = source.position.x + NEXT_DX;
  let y = source.position.y;
  const occupied = (py: number) =>
    nodes.some(
      (n) => Math.abs(n.position.x - x) < BOX_W && Math.abs(n.position.y - py) < BOX_H,
    );
  while (occupied(y)) y += ROW_DY;
  return { x, y };
}

/** Image Gen → video CTA gate: needs an image; approval guides (nudge), never blocks (D29). */
export function imageGenGate(source: AppNode): GuidedGate {
  const d = source.data as { parsed?: unknown; approvalStatus?: string };
  if (d.parsed == null) return { enabled: false, nudge: "Generate an image first" };
  if (d.approvalStatus !== "approved") return { enabled: true, nudge: "Not approved yet" };
  return { enabled: true };
}
