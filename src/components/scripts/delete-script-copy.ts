import { SCRIPT_DELETE_BLOCKED, type ScriptDeleteBlock } from "@/lib/scripts/constants";

/** D384 — what the delete dialog says: a confirm when nothing blocks, otherwise the reason. */
export function deleteDialogCopy(block: ScriptDeleteBlock | null): { canDelete: boolean; title: string; description: string } {
  if (block) return { canDelete: false, title: "This script can't be deleted", description: SCRIPT_DELETE_BLOCKED[block] };
  return {
    canDelete: true,
    title: "Delete this script?",
    description: "The brief, the copilot conversation and the storyboard go with it. This can't be undone.",
  };
}
