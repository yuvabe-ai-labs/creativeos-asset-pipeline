"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { deletePiece } from "@/lib/editor/captions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditorStore } from "./editor-store-provider";

// Page-level UI the menus and panels share (D405, reworked to the task-menu design): which side of
// the side panel shows (Sources | Inspector), which task is open in the Inspector, the delete
// confirm, and going back to the canvas.
export type EditorSide = "sources" | "inspector";
export type EditorTask = "captions" | "dub" | "lip";

type Ui = {
  side: EditorSide;
  setSide(s: EditorSide): void;
  /** The task open in the Inspector, or null for the task list. */
  task: EditorTask | null;
  /** Open a task for one clip (its id) or for all clips (null): selects it and shows the Inspector. */
  openTask(t: EditorTask, pieceId: string | null): void;
  closeTask(): void;
  /** Ask before deleting a clip. */
  askDeletePiece(pieceId: string): void;
  goToCanvas(): void;
};

const UiContext = createContext<Ui | null>(null);

export function EditorUiProvider({ panelShown, showPanel, side, setSide, goToCanvas, children }: {
  panelShown: boolean;
  showPanel(): void;
  side: EditorSide;
  setSide(s: EditorSide): void;
  goToCanvas(): void;
  children: ReactNode;
}) {
  const [task, setTask] = useState<EditorTask | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);

  const value = useMemo<Ui>(
    () => ({
      side,
      setSide,
      task,
      openTask: (t, pieceId) => {
        select(pieceId ? { kind: "piece", id: pieceId } : null);
        setTask(t);
        setSide("inspector");
        if (!panelShown) showPanel();
      },
      closeTask: () => setTask(null),
      askDeletePiece: setDeleting,
      goToCanvas,
    }),
    [side, setSide, task, select, panelShown, showPanel, goToCanvas],
  );

  const index = deleting ? pieces.findIndex((p) => p.id === deleting) : -1;
  const handle = index >= 0 ? sources.find((s) => s.nodeId === pieces[index].sourceNodeId)?.handle : undefined;

  return (
    <UiContext.Provider value={value}>
      {children}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this clip?</AlertDialogTitle>
            <AlertDialogDescription>
              {index >= 0 ? `${index + 1}. ${handle ?? "This clip"}` : "This clip"} and its captions come off the timeline. You can undo it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) apply((d) => deletePiece(d, deleting));
                setDeleting(null);
              }}
            >
              Delete clip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UiContext.Provider>
  );
}

export function useEditorUi(): Ui {
  const v = useContext(UiContext);
  if (!v) throw new Error("useEditorUi must be used inside EditorUiProvider");
  return v;
}
