"use client";

import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "./editor-store-provider";

/** Undo / redo in the header (D400). Ctrl+Z and Ctrl+Shift+Z do the same. */
export function EditorHistoryButtons() {
  const canUndo = useEditorStore((s) => s.editable && s.past.length > 0);
  const canRedo = useEditorStore((s) => s.editable && s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 className="size-4" strokeWidth={1.5} />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
