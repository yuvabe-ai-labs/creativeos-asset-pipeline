// Pure guided next-node flow logic (D36). Uses ONLY `import type` from React Flow, so it
// is safe to import anywhere. The whole reel pipeline progression is data here; nothing
// runs a model (D11) — the store action just creates/connects/places the next node.
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { findAncestorOfType } from "@/lib/canvas/graph";

const NEXT_DX = 360;   // horizontal gap to the next node (matches fanOutShots)
const ROW_DY = 170;    // vertical nudge when a spot is taken
const BOX = { width: 300, height: 150 }; // a card not yet measured, of a type not listed below
const CLEARANCE = 24;  // empty canvas kept between the new card and any other
const MAX_NUDGES = 40; // never search further down than this

/** D503 — the card the chain is about to add, before it renders: the prompt nodes are `w-44`
 *  cards; Image gen and Video gen with 9:16 output are about 480 × 590. */
const NEXT_CARD: Record<string, { width: number; height: number }> = {
  prompt: { width: 176, height: 220 },
  "video-prompt": { width: 176, height: 220 },
  "multishot-prompt": { width: 176, height: 220 },
  "image-gen": { width: 480, height: 600 },
  "video-gen": { width: 480, height: 600 },
};

export type GuidedGate = { enabled: boolean; nudge?: string };

/**
 * Drop the next node to the right of `source`, nudging down until the spot is clear. D503 — clear
 * of every card's real rectangle (its measured size; an estimate until it renders), so a tall card
 * below the row, such as Fan out's shot still, is never covered by the next step.
 */
export function placeNextTo(source: AppNode, nodes: AppNode[], nextType?: string): { x: number; y: number } {
  // Past the source's own right edge: a 480-wide Image gen would otherwise sit under its next step.
  const x = source.position.x + Math.max(NEXT_DX, (source.measured?.width ?? 0) + 2 * CLEARANCE);
  const size = (nextType && NEXT_CARD[nextType]) || BOX;
  const occupied = (y: number) =>
    nodes.some((n) => {
      if (n.id === source.id) return false;
      const w = n.measured?.width ?? BOX.width;
      const h = n.measured?.height ?? BOX.height;
      return (
        x < n.position.x + w + CLEARANCE && n.position.x < x + size.width + CLEARANCE &&
        y < n.position.y + h + CLEARANCE && n.position.y < y + size.height + CLEARANCE
      );
    });
  let y = source.position.y;
  for (let i = 0; i < MAX_NUDGES && occupied(y); i++) y += ROW_DY;
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
  // The multishot lane. It skips the still and the image prompt entirely (D230): a start frame
  // fixes one composition, which is the wrong input for a clip that cuts between several. Without
  // this entry GuidedNextButton returned null on a Multishot node, so the card's own chip rendered
  // nothing and the lane had no guided step at all.
  multishot:      { nextType: "multishot-prompt", createLabel: "Create multishot prompt",
                    openLabel: "Open multishot prompt" },
  "multishot-prompt": { nextType: "video-gen", createLabel: "Create video generation",
                        openLabel: "Open video generation" },
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
    position: placeNextTo(source, nodes, step.nextType),
    parentIds,
    gate,
  };
}
