// src/hooks/use-post-editor.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { PostLayer, ImageLayer, ImageSource, IconSource } from "@/lib/post/types";
import {
  createTextLayer, createShapeLayer, createImageLayer, createIconLayer,
  addLayer, removeLayer, updateLayer, duplicateLayer as duplicateLayerPure,
  reorderLayer, toggleLock as toggleLockPure, toggleHidden as toggleHiddenPure,
  type ReorderDirection,
} from "@/lib/post/layers";
import {
  createHistory, commit as commitHistory, undo as undoHistory, redo as redoHistory,
  canUndo as canUndoHistory, canRedo as canRedoHistory, type History,
} from "@/lib/post/history";

export function usePostEditor(initialLayers: PostLayer[], onChange: (layers: PostLayer[]) => void) {
  const [history, setHistory] = useState<History<PostLayer[]>>(() => createHistory(initialLayers));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Live geometry during an in-progress gesture (drag/resize/rotate) — NOT yet committed
  // to history. null when no gesture is in flight, in which case `layers` reads straight
  // from history.present.
  const liveLayersRef = useRef<PostLayer[] | null>(null);
  const [, forceRender] = useState(0);

  // Always holds the latest `onChange` — read (not captured) by every action method so
  // a non-memoized `onChange` passed by the caller never goes stale inside a `useCallback`
  // that only rebuilds when `history.present` changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const layers = liveLayersRef.current ?? history.present;

  function applyCommitted(next: PostLayer[]) {
    setHistory((h) => commitHistory(h, next));
    onChangeRef.current(next);
  }

  const selectLayer = useCallback((id: string | null) => setSelectedId(id), []);

  const addText = useCallback(() => {
    const layer = createTextLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedId(layer.id);
  }, [history.present]);

  const addShape = useCallback(() => {
    const layer = createShapeLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedId(layer.id);
  }, [history.present]);

  // `overrides` lets a call site place the layer with its own geometry (the auto-placed
  // connected image wants a full-bleed 0,0,1,1 plate, not createImageLayer's generic
  // small default) without changing that default for the plain "Add > Image" case.
  const addImage = useCallback((src: ImageSource, overrides?: Partial<ImageLayer>) => {
    const layer = createImageLayer(src, overrides);
    applyCommitted(addLayer(history.present, layer));
    setSelectedId(layer.id);
  }, [history.present]);

  const addIcon = useCallback((src: IconSource) => {
    const layer = createIconLayer(src);
    applyCommitted(addLayer(history.present, layer));
    setSelectedId(layer.id);
  }, [history.present]);

  // Applies an in-progress gesture's intermediate state WITHOUT touching history — call
  // on every pointermove while dragging/resizing/rotating, or on every keystroke while
  // editing text inline. Must be followed by commitLayerChange() once the gesture ends.
  const updateLayerLive = useCallback((id: string, patch: Partial<PostLayer>) => {
    const base = liveLayersRef.current ?? history.present;
    liveLayersRef.current = updateLayer(base, id, patch);
    forceRender((n) => n + 1);
  }, [history.present]);

  // Lands the gesture as ONE undo step (pointerup/blur) — the resolved "coalesced per
  // gesture" answer to post-node-design.md §17.
  const commitLayerChange = useCallback(() => {
    if (!liveLayersRef.current) return;
    const next = liveLayersRef.current;
    liveLayersRef.current = null;
    applyCommitted(next);
  }, [history.present]);

  const deleteLayer = useCallback((id: string) => {
    applyCommitted(removeLayer(history.present, id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, [history.present]);

  const duplicateLayer = useCallback((id: string) => {
    applyCommitted(duplicateLayerPure(history.present, id));
  }, [history.present]);

  const reorder = useCallback((id: string, direction: ReorderDirection) => {
    applyCommitted(reorderLayer(history.present, id, direction));
  }, [history.present]);

  const toggleLock = useCallback((id: string) => {
    applyCommitted(toggleLockPure(history.present, id));
  }, [history.present]);

  const toggleHidden = useCallback((id: string) => {
    applyCommitted(toggleHiddenPure(history.present, id));
  }, [history.present]);

  // Swaps the WHOLE scene as one undo step — the template picker's "seed these layers"
  // action. Must go through the hook (not a direct onPatch by the caller): the hook seeds
  // its history once from `initialLayers`, so a caller that writes layers around it would
  // be silently overwritten by the hook's stale present on the very next edit.
  const replaceAllLayers = useCallback((next: PostLayer[]) => {
    liveLayersRef.current = null;
    applyCommitted(next);
    setSelectedId(null);
    // No history.present dependency: this REPLACES the scene rather than deriving from it.
  }, []);

  const undo = useCallback(() => {
    let nextPresent: PostLayer[] | undefined;
    setHistory((h) => {
      const next = undoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) onChangeRef.current(nextPresent);
  }, []);

  const redo = useCallback(() => {
    let nextPresent: PostLayer[] | undefined;
    setHistory((h) => {
      const next = redoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) onChangeRef.current(nextPresent);
  }, []);

  return {
    layers,
    selectedId,
    selectLayer,
    addText,
    addShape,
    addImage,
    addIcon,
    updateLayerLive,
    commitLayerChange,
    replaceAllLayers,
    deleteLayer,
    duplicateLayer,
    reorder,
    toggleLock,
    toggleHidden,
    undo,
    redo,
    canUndo: canUndoHistory(history),
    canRedo: canRedoHistory(history),
  };
}
