"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useShotHiddenCount } from "@/components/canvas/shot-collapse-context";

// D387 — the Collapse / Expand button in a Shot or Multishot header. Collapsing hides the node's
// own pipeline; the card stays put as a small stack. While collapsed the button carries how many
// nodes are inside, so it's clear there is more — in the header, where it can't crowd the footer's
// action chips. Disabled for read-only viewers.
export function CollapseToggle({
  nodeId,
  collapsed,
  label,
}: {
  nodeId: string;
  collapsed: boolean;
  /** The card's name, for the accessible label ("Collapse Shot 2"). */
  label: string;
}) {
  const setShotsCollapsed = useCanvasStore((s) => s.setShotsCollapsed);
  const canEdit = useCanvasEditable();
  const hiddenCount = useShotHiddenCount(nodeId);
  const showCount = collapsed && hiddenCount > 0;
  const Icon = collapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={!canEdit}
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}${showCount ? `, ${hiddenCount} hidden` : ""}`}
      aria-expanded={!collapsed}
      title={showCount ? `${hiddenCount} hidden` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        setShotsCollapsed([nodeId], !collapsed);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="nodrag h-6 px-1.5 text-[0.65rem] text-muted-foreground"
    >
      <Icon strokeWidth={1.5} />
      {collapsed ? "Expand" : "Collapse"}
      {showCount && (
        <span className="rounded-full bg-muted px-1.5 text-[0.6rem] tabular-nums text-foreground/70">
          {hiddenCount}
        </span>
      )}
    </Button>
  );
}
