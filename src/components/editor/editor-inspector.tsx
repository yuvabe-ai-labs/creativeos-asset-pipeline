"use client";
// The Inspector (task-menu design): no tabs. With no task open it lists what can be done — to the
// selected clip, or to all clips when none is selected — each with where it stands. A task opens
// in place, with a back arrow to the list.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Piece, SourceView } from "@/lib/editor/types";
import { EditorCaptionsPanel, type CaptionsTab } from "./editor-captions-panel";
import { EditorClipCaptionsTab } from "./editor-clip-captions-tab";
import { EditorDubTask } from "./editor-dub-task";
import { EditorLipTask } from "./editor-lip-task";
import { useEditorStore } from "./editor-store-provider";
import { useEditorUi } from "./editor-ui-context";
import { TASK_LABEL, useEditorTasks } from "./use-editor-tasks";

export function EditorInspector() {
  // A selected caption counts as its clip, so its Captions task (and the caption's own style) opens
  // instead of the reel-wide style (D505).
  const pieceId = useEditorStore((s) => {
    const sel = s.selection;
    if (!sel) return null;
    return sel.kind === "piece" ? sel.id : (s.doc.captions.find((c) => c.id === sel.id)?.pieceId ?? null);
  });
  const piece = useEditorStore((s) => (pieceId ? s.doc.pieces.find((p) => p.id === pieceId) : undefined)) ?? null;
  const captionSelected = useEditorStore((s) => s.selection?.kind === "caption");
  const select = useEditorStore((s) => s.select);
  const source = useEditorStore((s) => (piece ? s.sources.find((x) => x.nodeId === piece.sourceNodeId) : undefined));
  const index = useEditorStore((s) => (piece ? s.doc.pieces.findIndex((p) => p.id === piece.id) : -1));
  const count = useEditorStore((s) => s.doc.pieces.length);
  const { task: openTask, closeTask } = useEditorUi();
  // Selecting a caption shows its clip's Captions task even when no task is open.
  const task = openTask ?? (captionSelected && piece ? "captions" : null);
  const back = () => {
    closeTask();
    if (captionSelected && piece) select({ kind: "piece", id: piece.id });
  };
  // Style is the default captions tab, and selecting a caption doesn't switch away from it (D413).
  const [captionsTab, setCaptionsTab] = useState<CaptionsTab>("style");
  const clipName = piece ? `${index + 1}. ${source?.handle ?? "Missing clip"}` : null;

  if (task) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Back to the task list" onClick={back}>
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </Button>
          <div className="flex min-w-0 flex-col">
            <h3 className="m-0 font-display text-base font-semibold">{TASK_LABEL[task]}</h3>
            <span className="truncate text-xs text-muted-foreground">{clipName ?? `All clips · ${count}`}</span>
          </div>
        </div>
        {task === "captions" &&
          (piece ? <EditorClipCaptionsTab piece={piece} /> : <EditorCaptionsPanel tab={captionsTab} onTab={setCaptionsTab} />)}
        {task !== "captions" && (piece && source ? <TaskForClip task={task} piece={piece} source={source} /> : <SelectAClip task={task} />)}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TaskList piece={piece} title={clipName} count={count} />
    </div>
  );
}

function TaskForClip({ task, piece, source }: { task: "dub" | "lip"; piece: Piece; source: SourceView }) {
  return task === "dub" ? <EditorDubTask piece={piece} source={source} /> : <EditorLipTask piece={piece} source={source} />;
}

function SelectAClip({ task }: { task: "dub" | "lip" }) {
  return (
    <p className="m-0 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      {task === "dub" ? "Select a clip on the timeline to dub it." : "Select a dubbed clip on the timeline to lip sync it."}
    </p>
  );
}

function TaskList({ piece, title, count }: { piece: Piece | null; title: string | null; count: number }) {
  const rows = useEditorTasks(piece);
  const select = useEditorStore((s) => s.select);
  const { openTask } = useEditorUi();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 min-w-0 truncate font-display text-base font-semibold">{title ?? "All clips"}</h3>
        {piece && (
          <Button variant="ghost" size="xs" onClick={() => select(null)}>
            All clips
          </Button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {piece ? "Selected clip. Actions here change this clip only." : `${count} clip${count === 1 ? "" : "s"} on the timeline. Select a clip to work on just that one.`}
      </span>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <Button
            key={r.task}
            variant="outline"
            disabled={r.disabled}
            onClick={() => openTask(r.task, piece?.id ?? null)}
            className="h-auto justify-between gap-2 px-3 py-2.5 text-left font-normal"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{r.label}</span>
              <span className="truncate text-xs text-muted-foreground">{r.meta}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          </Button>
        ))}
      </div>
    </section>
  );
}
