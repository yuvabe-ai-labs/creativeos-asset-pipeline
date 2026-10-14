// What the canvas does with its cached copy of a node's versions when the org's live channel
// says that node's versions changed (useNodeVersionsLiveSync). Pure, so it is tested on its own.
//
//   ignore          — not this canvas's node, or its focus view is open: an open view already
//                     refreshes itself (useNodeVersionUpdates), and a second read would double it.
//   refetch         — something on screen shows it without being its own view (the Image Gen
//                     view's connected-prompt text): re-read it in place.
//   drop            — cached but not on screen: discard it, so the next open waits on a fresh
//                     read rather than showing a list known to be out of date.
//   mark-all-stale  — the event names no node (a DELETE without REPLICA IDENTITY FULL): every
//                     cached list might be affected, so each re-checks the next time it's read.
export type VersionsCacheUpdate = "ignore" | "refetch" | "drop" | "mark-all-stale";

export function planVersionsCacheUpdate(input: {
  changedNodeId: string | null;
  isOnCanvas: (nodeId: string) => boolean;
  openFocusViewIds: readonly string[];
  /** Whether something mounted and enabled is reading this node's versions right now. */
  isShowing: (nodeId: string) => boolean;
}): VersionsCacheUpdate {
  const { changedNodeId: id } = input;
  if (id === null) return "mark-all-stale";
  if (!input.isOnCanvas(id) || input.openFocusViewIds.includes(id)) return "ignore";
  return input.isShowing(id) ? "refetch" : "drop";
}
