"use client";

import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useCachedAvatars } from "@/hooks/queries/avatars";
import type { ReelScript } from "@/lib/nodes/reel-script";

/**
 * D472 — the people on this canvas, by their avatars' names, for "who says this line". Reads the
 * avatars the canvas's Avatar nodes already loaded (no fetch). It scans the canvas's nodes, so it
 * belongs only in a view that is open one at a time (a focus view), never in a node's card.
 *
 * D476 — and the people who speak in the script this Multishot came from, so a character with no
 * avatar yet can still be picked.
 */
export function useCanvasPeople(multishotNodeId?: string): string[] {
  const clientId = useClientId();
  const ids = useCanvasStore(
    useShallow((s) => [...new Set(s.nodes.flatMap((n) => (n.type === "avatar" && n.data.avatarId ? [n.data.avatarId] : [])))]),
  );
  const scriptSpeakers = useCanvasStore(
    useShallow((s) => {
      const multishot = multishotNodeId ? s.nodes.find((n) => n.id === multishotNodeId) : undefined;
      const scriptNodeId = (multishot?.data as { seededFrom?: { scriptNodeId?: string } } | undefined)?.seededFrom?.scriptNodeId;
      const script = scriptNodeId ? s.nodes.find((n) => n.id === scriptNodeId) : undefined;
      const parsed = (script?.data as { parsed?: ReelScript } | undefined)?.parsed;
      return speakersOf(parsed);
    }),
  );
  const avatars = useCachedAvatars(clientId, ids);
  const avatarNames = ids.flatMap((id) => {
    const name = avatars.get(id)?.name?.trim();
    return name ? [name] : [];
  });
  return [...new Set([...avatarNames, ...scriptSpeakers])];
}

/** D476 — everyone the script gives a line to on camera, in the order they first speak. */
export function speakersOf(script: ReelScript | undefined): string[] {
  const names = (script?.visual_script?.shots ?? []).flatMap((shot) =>
    (shot.voiceover ?? []).map((l) => l.speaker?.trim() ?? "").filter((s) => s && s !== "narrator"),
  );
  return [...new Set(names)];
}
