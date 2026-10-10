"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAvatar } from "@/hooks/queries/avatars";
import { presenterEdge } from "@/lib/avatars/canvas";
import { presenterInShot, readPresenterSwitch, seedingScriptId, type PresenterRowInput } from "@/lib/avatars/presenter";
import type { Avatar } from "@/lib/avatars/schema";

export type ShotPresenterView = {
  avatarNodeId: string;
  avatar: Avatar;
  inShot: boolean;
  /** Whether the operator has set the switch — otherwise `inShot` is the shot's default. */
  chosen: boolean;
};

// D299 — the presenter of a prompt node, read from the canvas: the script that seeded its Shot or
// Multishot, that script's presenter, and whether it is in this shot. The same pure rules the
// server uses (`presenter.ts`), fed the canvas's rows, so the switch shows what generation does.
export function useShotPresenter(promptNodeId: string | null | undefined): ShotPresenterView | null {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const clientId = useClientId();

  const found = useMemo(() => {
    if (!promptNodeId) return null;
    const node = nodes.find((n) => n.id === promptNodeId);
    if (!node) return null;
    const sources = new Set(edges.filter((e) => e.target === promptNodeId).map((e) => e.source));
    const rows: PresenterRowInput[] = nodes
      .filter((n) => sources.has(n.id))
      .map((n) => ({ nodeId: n.id, type: n.type ?? "", data: n.data as Record<string, unknown> }));
    const scriptId = seedingScriptId(rows);
    if (!scriptId) return null;
    const edge = presenterEdge(scriptId, nodes, edges);
    if (!edge) return null;
    const avatarNode = nodes.find((n) => n.id === edge.source);
    const avatarId = (avatarNode?.data as { avatarId?: unknown } | undefined)?.avatarId;
    if (typeof avatarId !== "string" || !avatarId) return null;
    const stored = readPresenterSwitch((node.data as { presenter?: unknown }).presenter);
    return { avatarNodeId: edge.source, avatarId, inShot: presenterInShot(stored, rows), chosen: Boolean(stored) };
  }, [promptNodeId, nodes, edges]);

  const lookup = useAvatar(clientId, found?.avatarId ?? "");
  if (!found || lookup.status !== "ready") return null;
  return { avatarNodeId: found.avatarNodeId, avatar: lookup.avatar, inShot: found.inShot, chosen: found.chosen };
}
