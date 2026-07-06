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

export type GuidedStep = {
  nextType: string;
  createLabel: string;
  openLabel: string;
  alsoWireAncestors?: string[];
  gate?: (source: AppNode) => GuidedGate;
};

// The reel pipeline, as data. Single source of truth for "what comes next".
export const GUIDED_CHAIN: Record<string, GuidedStep> = {
  shot:           { nextType: "prompt",       createLabel: "Create image prompt",     openLabel: "Open image prompt" },
  prompt:         { nextType: "image-gen",    createLabel: "Create image generation", openLabel: "Open image generation" },
  "image-gen":    { nextType: "video-prompt", createLabel: "Create video prompt",     openLabel: "Open video prompt",
                    alsoWireAncestors: ["shot"], gate: imageGenGate },
  "video-prompt": { nextType: "video-gen",    createLabel: "Create video generation", openLabel: "Open video generation",
                    alsoWireAncestors: ["image-gen"] },
  // video-gen is terminal — no entry.
};

export type GuidedPlan = {
  nextType: string;
  existingId: string | null;             // navigate here instead of creating (idempotent)
  position: { x: number; y: number };
  parentIds: string[];                   // nodes to wire INTO the new node (source + ancestors)
  gate: GuidedGate;
};

/** Plan the next node for `source`: type, existing-or-new, placement, parents to wire. */
export function planGuidedNext(source: AppNode, nodes: AppNode[], edges: Edge[]): GuidedPlan | null {
  const step = GUIDED_CHAIN[source.type as string];
  if (!step) return null;
  const gate = step.gate?.(source) ?? { enabled: true };
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Already wired to a node of nextType? → navigate, never duplicate.
  const existing = edges.find(
    (e) => e.source === source.id && byId.get(e.target)?.type === step.nextType,
  );
  if (existing) {
    return { nextType: step.nextType, existingId: existing.target, position: source.position, parentIds: [], gate };
  }

  // Parents to wire into the new node: the source, plus each resolved ancestor (D24).
  const parentIds = [source.id];
  for (const ancType of step.alsoWireAncestors ?? []) {
    const anc = findAncestorOfType(source.id, nodes, edges, ancType);
    if (anc) parentIds.push(anc.id);
  }

  return {
    nextType: step.nextType,
    existingId: null,
    position: placeNextTo(source, nodes),
    parentIds,
    gate,
  };
}
