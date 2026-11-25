import type { PostNodeData } from "@/lib/canvas-nodes";

/**
 * What the Post node writes to the canvas store for an editor patch, or null for "write nothing".
 *
 * Not editable (no canvas edit right, or someone else holds the lock): nothing is written.
 * Editable: a patch that carries layers is a design edit and is stamped with the edit time, so the
 * render goes stale; patches without layers (title, auto-place bookkeeping, thumbnail) are not.
 */
export function postPatchForStore(
  patch: Partial<PostNodeData>,
  canEdit: boolean,
  now: Date = new Date(),
): Partial<PostNodeData> | null {
  if (!canEdit) return null;
  return "layers" in patch ? { ...patch, layersUpdatedAt: now.toISOString() } : patch;
}
