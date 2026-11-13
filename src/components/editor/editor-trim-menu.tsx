"use client";
// Trim (task-menu design): trim the selected clip's start or end to the playhead, from the timeline
// toolbar. The same trim as dragging an edge (useTimelineActions.trim), so it keeps to whole frames
// and one undo step.
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTimelineActions } from "@/hooks/use-timeline-actions";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** A trim must leave at least this much of the clip. */
const MIN_LEFT = 0.5;
/** The playhead must be this far inside the clip, so a trim never lands on its very edge. */
const EDGE = 0.05;

export function EditorTrimMenu() {
  const editable = useEditorStore((s) => s.editable);
  const pieces = useEditorStore((s) => s.doc.pieces);
  const selectedId = useEditorStore((s) => (s.selection?.kind === "piece" ? s.selection.id : null));
  const handle = useEditorStore((s) => {
    const p = selectedId ? s.doc.pieces.find((x) => x.id === selectedId) : undefined;
    return p ? s.sources.find((x) => x.nodeId === p.sourceNodeId)?.handle : undefined;
  });
  const { time } = usePlayback();
  const { trim } = useTimelineActions();

  const index = selectedId ? pieces.findIndex((p) => p.id === selectedId) : -1;
  const piece = index >= 0 ? pieces[index] : null;
  const start = piece ? pieceOffsets(pieces)[index] : 0;
  const length = piece ? piece.out - piece.in : 0;
  const local = time - start;
  const inside = piece !== null && local > EDGE && local < length - EDGE;
  const fromStart = local;
  const fromEnd = length - local;

  const meta = (cut: number, where: "start" | "end") =>
    !piece ? "No clip selected" : !inside ? "Move the playhead inside the clip" : length - cut < MIN_LEFT ? "Too little would be left" : `Cuts ${cut.toFixed(1)}s from the ${where}`;
  const canStart = editable && inside && length - fromStart >= MIN_LEFT;
  const canEnd = editable && inside && length - fromEnd >= MIN_LEFT;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={!editable || pieces.length === 0} title="Trim the selected clip to the playhead" className="gap-1.5">
            Trim
            <ChevronDown className="size-3.5" strokeWidth={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64 min-w-0">
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel className="flex flex-col gap-0.5 text-xs normal-case tracking-normal">
            <span className="text-[13px] font-semibold text-foreground">Trim</span>
            <span className="truncate font-normal">
              {piece ? `${index + 1}. ${handle ?? "Missing clip"} · ${formatTime(length)}` : "Select a clip on the timeline first"}
            </span>
          </DropdownMenuGroupLabel>
          <DropdownMenuItem disabled={!canStart} onClick={() => piece && trim(piece.id, "in", piece.in + fromStart)} className="items-start py-1.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Trim start to playhead</span>
              <span className="text-xs text-muted-foreground">{meta(fromStart, "start")}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canEnd} onClick={() => piece && trim(piece.id, "out", piece.in + local)} className="items-start py-1.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Trim end to playhead</span>
              <span className="text-xs text-muted-foreground">{meta(fromEnd, "end")}</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <p className="m-0 px-3 pb-2 pt-1 text-xs text-muted-foreground">Or drag either edge of the selected clip.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
