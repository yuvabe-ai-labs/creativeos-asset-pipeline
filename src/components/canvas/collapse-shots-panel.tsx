"use client";

import { Panel } from "@xyflow/react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useCanvasEditable } from "./canvas-editable-context";

// D387 — tidy or restore the whole canvas at once. Sits beside the zoom controls; shown only
// when the canvas has shots. Each button is one store update, saved by the normal autosave.
export function CollapseShotsPanel({
  shotIds,
  collapsedCount,
}: {
  shotIds: ReadonlySet<string>;
  collapsedCount: number;
}) {
  const storeApi = useCanvasStoreApi();
  const canEdit = useCanvasEditable();
  if (shotIds.size === 0) return null;

  const setAll = (collapsed: boolean) => storeApi.getState().setShotsCollapsed([...shotIds], collapsed);

  return (
    // Offset past React Flow's Controls, which own the bottom-left corner.
    <Panel position="bottom-left" className="!left-12 flex gap-1.5">
      <Button
        variant="outline"
        size="xs"
        disabled={!canEdit || collapsedCount === shotIds.size}
        onClick={() => setAll(true)}
        className="bg-card shadow-card"
      >
        <ChevronsDownUp strokeWidth={1.5} /> Collapse all
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={!canEdit || collapsedCount === 0}
        onClick={() => setAll(false)}
        className="bg-card shadow-card"
      >
        <ChevronsUpDown strokeWidth={1.5} /> Expand all
      </Button>
    </Panel>
  );
}
