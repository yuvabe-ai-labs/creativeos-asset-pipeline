"use client";

import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useCachedAvatars } from "@/hooks/queries/avatars";

/**
 * D472 — the people on this canvas, by their avatars' names, for "who says this line". Reads the
 * avatars the canvas's Avatar nodes already loaded (no fetch). It scans the canvas's nodes, so it
 * belongs only in a view that is open one at a time (a focus view), never in a node's card.
 */
export function useCanvasPeople(): string[] {
  const clientId = useClientId();
  const ids = useCanvasStore(
    useShallow((s) => [...new Set(s.nodes.flatMap((n) => (n.type === "avatar" && n.data.avatarId ? [n.data.avatarId] : [])))]),
  );
  const avatars = useCachedAvatars(clientId, ids);
  return [...new Set(ids.flatMap((id) => {
    const name = avatars.get(id)?.name?.trim();
    return name ? [name] : [];
  }))];
}
