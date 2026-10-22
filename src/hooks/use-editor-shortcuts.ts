"use client";

import { useEffect } from "react";
import { usePlayback } from "@/components/editor/editor-playback-context";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useEditorView } from "@/components/editor/editor-view-context";
import { isEditableTarget } from "@/lib/canvas-node-options";
import { useTimelineActions } from "./use-timeline-actions";

/** The editor's keys (spec A8), never while typing in a field:
 *  Space play/pause · ←/→ a frame, Shift a second · Home/End · S split · Del delete ·
 *  Ctrl/⌘+Z undo, +Shift or Ctrl+Y redo (D400) · Ctrl/⌘ +/− zoom · Shift+Z fit ·
 *  Ctrl/⌘+1/2 panels (D403) · Esc deselect. */
export function useEditorShortcuts(panels: { toggleSources(): void; toggleInspector(): void }) {
  const store = useEditorStoreApi();
  const { playing, play, pause, step, fps, seek, total } = usePlayback();
  const { split, deleteSelection } = useTimelineActions();
  const { zoomBy, fit } = useEditorView();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target as HTMLElement | null)) return;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) store.getState().redo();
          else store.getState().undo();
        } else if (k === "y") {
          e.preventDefault();
          store.getState().redo();
        } else if (k === "=" || k === "+") {
          e.preventDefault();
          zoomBy(1.3);
        } else if (k === "-") {
          e.preventDefault();
          zoomBy(1 / 1.3);
        } else if (k === "1") {
          e.preventDefault();
          panels.toggleSources();
        } else if (k === "2") {
          e.preventDefault();
          panels.toggleInspector();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.shiftKey && (e.key === "Z" || e.key === "z")) {
        e.preventDefault();
        fit();
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
      } else if (e.key === "Home") {
        e.preventDefault();
        pause();
        seek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        pause();
        seek(total);
      } else if (e.key === "Escape") {
        store.getState().select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, playing, play, pause, split, deleteSelection, step, fps, seek, total, zoomBy, fit, panels]);
}
