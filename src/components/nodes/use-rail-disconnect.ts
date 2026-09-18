"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useCanvasStore, useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { connectionPath } from "@/lib/canvas/graph";
import { nodeLabel } from "@/lib/nodes/describe-node";

export type RailRemove = {
  /** Which hover control the row shows — see RailItem's `removeKind`. */
  kind: "disconnect" | "via";
  /** The control's title / aria-label. */
  label: string;
  onClick: () => void;
};

/**
 * The hover control on a focus view's "Connected" rail, shared by every focus view.
 *
 * A rail can list inputs that reach the node THROUGH another node — a Video Gen shows the images
 * wired into its prompt node. Those have no edge into this node, so the old ✕ called
 * `disconnectNodes` on a pair that was never wired: a silent no-op that read as broken. Now each
 * row's control says what it is: a ✕ removes a direct edge; a link icon marks an inherited input
 * and, clicked, names the node it comes from — which is where to unwire it.
 *
 * `removeFor` is what a view renders per row; `disconnect` is the click. Edges are read live so
 * the icons follow the canvas, and `onDisconnected` fires only after a REAL disconnect.
 */
export function useRailDisconnect(nodeId: string, onDisconnected?: (sourceId: string) => void) {
  const storeApi = useCanvasStoreApi();
  const edges = useCanvasStore((s) => s.edges);

  const viaNameOf = useCallback(
    (viaId: string) => {
      const via = storeApi.getState().nodes.find((n) => n.id === viaId);
      return via
        ? nodeLabel({ id: via.id, type: via.type, data: via.data as Record<string, unknown> }).name
        : "another node";
    },
    [storeApi],
  );

  const disconnect = useCallback(
    (sourceId: string, sourceLabel: string) => {
      const state = storeApi.getState();
      const path = connectionPath(state.edges, sourceId, nodeId);

      if (path.kind === "direct") {
        state.disconnectNodes(sourceId, nodeId);
        onDisconnected?.(sourceId);
        return;
      }
      if (path.kind === "via") {
        const viaName = viaNameOf(path.viaId);
        toast.info(`${sourceLabel} is connected through ${viaName}`, {
          description: `Open ${viaName} to disconnect it there.`,
        });
        return;
      }
      // Listed but no longer wired anywhere upstream — the list is stale, not the graph.
      toast.info(`${sourceLabel} is no longer connected`, {
        description: "Reload the view to refresh the list.",
      });
    },
    [storeApi, nodeId, onDisconnected, viaNameOf],
  );

  const removeFor = useMemo(
    () =>
      (sourceId: string, sourceLabel: string): RailRemove => {
        const path = connectionPath(edges, sourceId, nodeId);
        if (path.kind === "via") {
          return {
            kind: "via",
            label: `Connected through ${viaNameOf(path.viaId)}`,
            onClick: () => disconnect(sourceId, sourceLabel),
          };
        }
        return {
          kind: "disconnect",
          label: `Disconnect ${sourceLabel}`,
          onClick: () => disconnect(sourceId, sourceLabel),
        };
      },
    [edges, nodeId, viaNameOf, disconnect],
  );

  return { removeFor, disconnect };
}
