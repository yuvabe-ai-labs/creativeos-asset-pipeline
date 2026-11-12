"use client";

import type { ReactNode } from "react";
import { ChevronDown, Minus, Plus, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { useTimelineActions } from "@/hooks/use-timeline-actions";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/editor/timeline-view";
import { useEditorStore } from "./editor-store-provider";
import { EditorTrimMenu } from "./editor-trim-menu";
import { useEditorUi } from "./editor-ui-context";
import { useEditorView } from "./editor-view-context";
import { useEditorTasks } from "./use-editor-tasks";

/** The timeline's header (spec A3): caption tools, All clips and Trim (task-menu design), split and
 *  delete, zoom and fit. Deleting a clip asks first; deleting a caption doesn't (undo covers both). */
export function EditorTimelineToolbar({ tools }: { tools?: ReactNode }) {
  const editable = useEditorStore((s) => s.editable);
  const selection = useEditorStore((s) => s.selection);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const { split, deleteSelection } = useTimelineActions();
  const { zoom, setZoom, zoomBy, fit } = useEditorView();
  const ui = useEditorUi();
  const onDelete = () => (selection?.kind === "piece" ? ui.askDeletePiece(selection.id) : deleteSelection());

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <span className="text-eyebrow-sm">Timeline</span>
      <span className="flex-1" />
      {tools}
      <AllClipsMenu disabled={!hasPieces} />
      <EditorTrimMenu />
      <Button variant="outline" size="sm" onClick={split} disabled={!editable || !hasPieces} title="Split at the playhead (S)" className="gap-1.5">
        <Scissors className="size-3.5" strokeWidth={1.5} />
        Split
      </Button>
      <Button variant="outline" size="sm" onClick={onDelete} disabled={!editable || !selection} title="Delete the selection (Del)">
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

/** Captions, Dub and Lip sync for every clip on the timeline, opening in the Inspector. */
function AllClipsMenu({ disabled }: { disabled: boolean }) {
  const rows = useEditorTasks(null);
  const count = useEditorStore((s) => s.doc.pieces.length);
  const { openTask } = useEditorUi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} className="gap-1.5">
            All clips
            <ChevronDown className="size-3.5" strokeWidth={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60 min-w-0">
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel className="flex flex-col gap-0.5 text-xs normal-case tracking-normal">
            <span className="text-[13px] font-semibold text-foreground">All clips</span>
            <span className="font-normal">Every clip on the timeline · {count} clip{count === 1 ? "" : "s"}</span>
          </DropdownMenuGroupLabel>
          {rows.map((r) => (
            <DropdownMenuItem key={r.task} disabled={r.disabled} onClick={() => openTask(r.task, null)} className="items-start py-1.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{r.label}</span>
                <span className="truncate text-xs text-muted-foreground">{r.meta}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
