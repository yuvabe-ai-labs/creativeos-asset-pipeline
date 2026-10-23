"use client";

import type { ReactNode } from "react";
import { Minus, Plus, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useTimelineActions } from "@/hooks/use-timeline-actions";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/editor/timeline-view";
import { useEditorStore } from "./editor-store-provider";
import { useEditorView } from "./editor-view-context";

/** The timeline's header (spec A3): caption tools, split and delete, zoom and fit. */
export function EditorTimelineToolbar({ tools }: { tools?: ReactNode }) {
  const editable = useEditorStore((s) => s.editable);
  const selection = useEditorStore((s) => s.selection);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const { split, deleteSelection } = useTimelineActions();
  const { zoom, setZoom, zoomBy, fit } = useEditorView();

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <span className="text-eyebrow-sm">Timeline</span>
      <span className="flex-1" />
      {tools}
      <Button variant="outline" size="sm" onClick={split} disabled={!editable || !hasPieces} title="Split at the playhead (S)" className="gap-1.5">
        <Scissors className="size-3.5" strokeWidth={1.5} />
        Split
      </Button>
      <Button variant="outline" size="sm" onClick={deleteSelection} disabled={!editable || !selection} title="Delete the selection (Del)">
        Delete
      </Button>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="Zoom out" title="Zoom out (Ctrl −)" onClick={() => zoomBy(1 / 1.3)} className="size-7">
          <Minus className="size-3.5" strokeWidth={1.5} />
        </Button>
        <Slider aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={1} value={[zoom]} onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)} className="w-28" />
        <Button variant="ghost" size="icon" aria-label="Zoom in" title="Zoom in (Ctrl +)" onClick={() => zoomBy(1.3)} className="size-7">
          <Plus className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={fit} disabled={!hasPieces} title="Fit the reel (Shift Z)">
        Fit
      </Button>
    </div>
  );
}
