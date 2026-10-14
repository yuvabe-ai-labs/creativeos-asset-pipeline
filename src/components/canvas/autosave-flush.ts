import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { saveCanvasAction } from "@/lib/actions/nodes";
import { flowToPersisted, type AppNode } from "@/lib/canvas-nodes";
import { flowEdgeToRow } from "@/lib/db/edge-rows";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

export type FlushOutcome = "saved" | "lock-lost" | "error";

// What the server last confirmed: the arrays it was read from (a cheap first check — the store
// only ever replaces them, never mutates them) and a fingerprint of what was actually saved.
export type SavedBaseline = { nodes: AppNode[]; edges: Edge[]; fingerprint: string };

// Exactly the content a save sends, through the same projections the save itself uses —
// flowToPersisted for nodes, flowEdgeToRow for edges. React Flow replaces the nodes array to
// record a selection or a measured size, and focus views patch `parsed`/`approvalStatus`; none
// of that is persisted, so none of it may count as a change.
function persistedFingerprint(nodes: AppNode[], edges: Edge[]): string {
  return JSON.stringify([nodes.map(flowToPersisted), edges.map((e) => flowEdgeToRow("", e))]);
}

export function savedBaseline(nodes: AppNode[], edges: Edge[]): SavedBaseline {
  return { nodes, edges, fingerprint: persistedFingerprint(nodes, edges) };
}

// Whether a flush has anything to persist. Focus views flush before every open so their
// server reads see edges the client just drew, and clicking a node to open it is itself a
// store change — without this check every open was a full-canvas save with nothing new in it.
// A null baseline (never saved) counts as dirty.
export function hasUnsavedChanges(
  state: { nodes: AppNode[]; edges: Edge[]; removedNodeIds: string[]; removedEdgeIds: string[] },
  baseline: SavedBaseline | null,
): boolean {
  if (!baseline) return true;
  if (state.removedNodeIds.length > 0 || state.removedEdgeIds.length > 0) return true;
  if (state.nodes === baseline.nodes && state.edges === baseline.edges) return false;
  return persistedFingerprint(state.nodes, state.edges) !== baseline.fingerprint;
}

// D33: server-enforced flush. Sends the snapshot + sessionId; if the server rejects
// (lock lost), notifies via onLockLost so the client flips to read-only. Never throws,
// but the outcome is REPORTED, not swallowed: the caller must not clear its pending
// deletion intent (removedNodeIds) unless this returns "saved" — a dropped error here
// once lost a 933-node delete silently (the mass-delete URL-overflow incident).
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  sessionId: string;
  save: typeof saveCanvasAction;
  onLockLost: () => void;
}): Promise<FlushOutcome> {
  const { canvasId, snapshot, sessionId, save, onLockLost } = deps;
  try {
    const result = await save(canvasId, { ...snapshot, sessionId });
    if (!result.ok) {
      onLockLost();
      return "lock-lost";
    }
    return "saved";
  } catch {
    return "error";
  }
}
