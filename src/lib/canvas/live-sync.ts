import type { ApprovalStatus } from "@/lib/approval";

export type LiveSyncNode = { id: string; type?: string; data: Record<string, unknown> };

export type LiveSyncPatch = {
  id: string;
  patch: { approvalStatus?: ApprovalStatus; parsed?: string };
};

// Node types whose `parsed` is a rendered asset (an image or video URL) — safe to swap on the card
// because nothing on the card edits it. A prompt node's `parsed` is text the operator edits.
const MEDIA_NODE_TYPES = new Set(["image-gen", "video-gen"]);

/**
 * What an open canvas should change after someone else's write lands (R8.3/D202, BUG-002).
 *
 * Badges: every asset node's approval status, as before.
 *
 * Media: the active version's output on image-gen / video-gen nodes, so a reviewer on the same
 * canvas sees a designer's new version without refreshing. Skipped for any node whose focus view
 * THIS viewer has open — D19's rule that media never changes under someone mid-edit. That view
 * already refreshes itself (useNodeVersionUpdates); the card catches up when it closes.
 *
 * Returns only real changes: a no-op write would still churn autosave.
 */
export function planCanvasLiveSync(input: {
  nodes: LiveSyncNode[];
  statuses: Record<string, ApprovalStatus>;
  outputs: Record<string, string>;
  openFocusViewIds: string[];
}): LiveSyncPatch[] {
  const open = new Set(input.openFocusViewIds);
  const patches: LiveSyncPatch[] = [];

  for (const node of input.nodes) {
    const patch: LiveSyncPatch["patch"] = {};

    const status = input.statuses[node.id];
    if (status && node.data.approvalStatus !== status) patch.approvalStatus = status;

    const output = input.outputs[node.id];
    if (
      output &&
      MEDIA_NODE_TYPES.has(node.type ?? "") &&
      !open.has(node.id) &&
      node.data.parsed !== output
    ) {
      patch.parsed = output;
    }

    if (Object.keys(patch).length > 0) patches.push({ id: node.id, patch });
  }
  return patches;
}
