"use client";

import { useEffect } from "react";
import { usePlayback } from "@/components/editor/editor-playback-context";
import { isEditableTarget } from "@/lib/canvas-node-options";
import { useTimelineActions } from "./use-timeline-actions";

/** Space plays/pauses, S splits at the playhead, Backspace/Delete removes the selection — never
 *  while typing in a field (spec §6). */
export function useEditorShortcuts() {
  const { playing, play, pause } = usePlayback();
  const { split, deleteSelection } = useTimelineActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target as HTMLElement | null)) return;
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, play, pause, split, deleteSelection]);
}
