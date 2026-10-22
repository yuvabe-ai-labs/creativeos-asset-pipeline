"use client";

import { useEffect } from "react";
import { usePlayback } from "@/components/editor/editor-playback-context";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { isEditableTarget } from "@/lib/canvas-node-options";
import { useTimelineActions } from "./use-timeline-actions";

/** Space plays/pauses, S splits at the playhead, Backspace/Delete removes the selection, ←/→ step a
 *  frame (Shift: a second),
 *  Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes (D400) — never while typing in a field
 *  (spec §6). */
export function useEditorShortcuts() {
  const store = useEditorStoreApi();
  const { playing, play, pause, step, fps } = usePlayback();
  const { split, deleteSelection } = useTimelineActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target as HTMLElement | null)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) store.getState().redo();
          else store.getState().undo();
        } else if (k === "y") {
          e.preventDefault();
          store.getState().redo();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        split();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // One frame, or one second with Shift: checking a word lands on its frame (D397).
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        step(e.shiftKey ? dir * Math.round(fps) : dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, playing, play, pause, split, deleteSelection, step, fps]);
}
