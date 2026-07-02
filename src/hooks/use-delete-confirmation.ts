import { useCallback, useState } from "react";
import type { OnBeforeDelete } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";

type Pending = { count: number; resolve: (ok: boolean) => void };

// The confirmation gate for node deletion. `onBeforeDelete` is wired to
// <ReactFlow>, so it intercepts every delete that flows through React Flow —
// the keyboard (Delete/Backspace) and any deleteElements() call (context menu).
// It returns a promise that stays unresolved until the user answers the dialog.
export function useDeleteConfirmation() {
  const [pending, setPending] = useState<Pending | null>(null);

  const onBeforeDelete = useCallback<OnBeforeDelete<AppNode>>(({ nodes }) => {
    // Edges-only deletion (a bare connection) — cheap and easily redrawn, no confirm.
    if (nodes.length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setPending({ count: nodes.length, resolve });
    });
  }, []);

  // The handlers close over the current `pending` (dialogProps is rebuilt each
  // render). Promise.resolve is idempotent, so a stray second call — e.g. ESC
  // right after a button — is harmless; the first answer wins.
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return {
    onBeforeDelete,
    dialogProps: {
      open: pending !== null,
      count: pending?.count ?? 0,
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
    },
  };
}
