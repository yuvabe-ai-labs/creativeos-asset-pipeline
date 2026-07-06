"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { GenerationRow } from "@/lib/db/types";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useGenerationTray } from "@/hooks/use-generation-tray";
import { deriveTrayItems, type TrayStatus } from "@/lib/generation-tray";
import { GenerationTrayItem } from "./generation-tray-item";

const COLLAPSE_KEY = "generation-tray-collapsed";

// Module-level helper so the impure `Date.now()` (the stale-timeout clock) is not
// called inside the component's render scope — matches the codebase's `timeAgo`
// pattern and satisfies the react-hooks/purity rule.
function selectTrayItems(nodes: AppNode[], edges: Edge[], trayJobs: Record<string, GenerationRow>) {
  return deriveTrayItems(nodes, edges, Object.values(trayJobs), Date.now());
}

export function GenerationTray({ canvasId }: { canvasId: string }) {
  useGenerationTray(canvasId);

  const { nodes, edges, trayJobs, setFocusedNodeId } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      trayJobs: s.trayJobs,
      setFocusedNodeId: s.setFocusedNodeId,
    })),
  );
  const { setCenter, getNode } = useReactFlow();

  // Collapse preference persists across sessions (spec §8). Lazy initializer reads
  // localStorage once (SSR-guarded) — no effect, mirroring the video-gen focus view.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const items = selectTrayItems(nodes, edges, trayJobs);

  if (items.length === 0) return null;

  const counts = items.reduce<Record<TrayStatus, number>>(
    (acc, i) => {
      acc[i.status] += 1;
      return acc;
    },
    { running: 0, ready: 0, failed: 0 },
  );

  const onOpen = (nodeId: string) => {
    const node = getNode(nodeId);
    if (node) setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    setFocusedNodeId(nodeId);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => toggleCollapsed(false)}
        className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-card"
        aria-label="Expand generation tray"
      >
        <span className="flex items-center gap-1 text-xs text-primary">
          <Loader2 className="size-3 animate-spin stroke-[1.5]" /> {counts.running}
        </span>
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="size-3 stroke-[1.5]" /> {counts.ready}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="size-3 stroke-[1.5]" /> {counts.failed}
        </span>
      </button>
    );
  }

  return (
    <div className="absolute right-4 top-1/2 z-20 flex w-64 -translate-y-1/2 flex-col rounded-xl border border-border bg-card/95 shadow-card backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-eyebrow !text-[0.65rem]">Generation Tray</span>
        <button
          onClick={() => toggleCollapsed(true)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Collapse generation tray"
        >
          <ChevronDown className="size-4 stroke-[1.5]" />
        </button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto p-2">
        {items.map((item) => (
          <GenerationTrayItem key={item.nodeId} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
