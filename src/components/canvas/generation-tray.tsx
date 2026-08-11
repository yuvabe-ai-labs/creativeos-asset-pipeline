"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { GenerationRow } from "@/lib/db/types";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useGenerationTray } from "@/hooks/use-generation-tray";
import { deriveTrayItems, type TrayStatus } from "@/lib/generation-tray";
import { GenerationTrayItem } from "./generation-tray-item";

const COLLAPSE_KEY = "generation-tray-collapsed";

// The panel shell, shared by both states so collapsing reads as the SAME object losing its
// list — not as a different pill appearing somewhere else.
const SHELL =
  "absolute right-4 top-1/2 z-20 flex w-72 -translate-y-1/2 flex-col rounded-xl border border-border bg-card/95 shadow-card backdrop-blur";

// Same glyphs and same tones as the rows (see generation-tray-item.tsx), in the same order
// the list itself sorts: Running → Failed → Ready. Rendered only when the count is non-zero.
const COUNT_META: readonly {
  status: TrayStatus;
  icon: LucideIcon;
  tone: string;
  spin?: boolean;
}[] = [
  { status: "running", icon: Loader2, tone: "text-gen-running", spin: true },
  { status: "failed", icon: AlertTriangle, tone: "text-gen-failed" },
  { status: "ready", icon: CheckCircle2, tone: "text-gen-ready" },
];

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

  // Collapsed keeps the shell and the header; only the list goes away, and the counts move
  // up into the header so the tray still answers "what is happening" at a glance.
  if (collapsed) {
    return (
      <div className={SHELL}>
        <Button
          variant="ghost"
          onClick={() => toggleCollapsed(false)}
          aria-label="Expand generation tray"
          className="h-auto w-full justify-between rounded-xl px-3 py-2 font-normal hover:bg-transparent"
        >
          <span className="text-eyebrow !text-[0.65rem]">Generation Tray</span>
          <span className="flex items-center gap-2.5">
            {COUNT_META.map(({ status, icon: Icon, tone, spin }) =>
              counts[status] === 0 ? null : (
                <span key={status} className={cn("flex items-center gap-1 text-xs", tone)}>
                  <Icon className={cn("size-3.5 stroke-[1.5]", spin && "animate-spin")} />
                  {counts[status]}
                </span>
              ),
            )}
            <ChevronDown className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-eyebrow !text-[0.65rem]">Generation Tray</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => toggleCollapsed(true)}
          className="text-muted-foreground"
          aria-label="Collapse generation tray"
        >
          <ChevronUp className="size-4 stroke-[1.5]" />
        </Button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-2.5">
        {items.map((item) => (
          <GenerationTrayItem key={item.nodeId} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
