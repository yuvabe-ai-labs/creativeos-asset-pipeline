import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";

// Delete a node from a custom node component (context menu / delete button).
// Routes through React Flow's deleteElements instead of mutating the store
// directly, so the delete passes through onBeforeDelete — the same confirmation
// gate the keyboard Delete/Backspace uses. deleteElements also removes the node's
// connected edges, and the store's onNodesChange tracks the removals for autosave.
export function useDeleteNode() {
  const { deleteElements } = useReactFlow<AppNode>();
  return useCallback(
    (id: string) => {
      void deleteElements({ nodes: [{ id }] });
    },
    [deleteElements],
  );
}
