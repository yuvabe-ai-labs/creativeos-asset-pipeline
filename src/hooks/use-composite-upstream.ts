"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAvatars } from "@/hooks/queries/avatars";
import { compositeUpstreamItems, type CompositeUpstreamItem } from "@/lib/composite/upstream-items";

/** D309 — the inputs wired into a composite, with avatars named and pictured. Raw store slices
 *  are selected and the list derived in useMemo — building it inside the selector would return a
 *  fresh array every time and loop useSyncExternalStore. */
export function useCompositeUpstream(nodeId: string): CompositeUpstreamItem[] {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const clientId = useClientId();
  const { data: avatars } = useAvatars(clientId);
  return useMemo(
    () => compositeUpstreamItems(nodeId, nodes, edges, avatars ?? []),
    [nodeId, nodes, edges, avatars],
  );
}
