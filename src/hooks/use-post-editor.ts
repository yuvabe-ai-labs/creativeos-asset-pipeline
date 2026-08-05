// src/hooks/use-post-editor.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { PostLayer, ImageLayer, ImageSource, IconSource } from "@/lib/post/types";
import {
  createTextLayer, createShapeLayer, createImageLayer, createIconLayer,
  addLayer, removeLayer, updateLayer, duplicateLayer as duplicateLayerPure,
  reorderLayer, reorderLayerToIndex, toggleLock as toggleLockPure, toggleHidden as toggleHiddenPure,
  groupLayers, ungroupLayers, copyLayers, pasteLayers,
  type ReorderDirection,
} from "@/lib/post/layers";
import { alignLayers, type AlignMode } from "@/lib/post/align";
import {
  createHistory, commit as commitHistory, undo as undoHistory, redo as redoHistory,
  canUndo as canUndoHistory, canRedo as canRedoHistory, type History,
} from "@/lib/post/history";
import { useDebouncedCallback } from "./use-debounced-callback";

export function usePostEditor(
  initialLayers: PostLayer[],
  onChange: (layers: PostLayer[]) => void,
  onChangeDelayMs = 2000,
) {
  const [history, setHistory] = useState<History<PostLayer[]>>(() => createHistory(initialLayers));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Live geometry during an in-progress gesture (drag/resize/rotate) — NOT yet committed
  // to history. null when no gesture is in flight, in which case `layers` reads straight
  // from history.present.
  const liveLayersRef = useRef<PostLayer[] | null>(null);
  // No-OS-clipboard copy/paste buffer — a plain ref so it survives across renders without
  // itself triggering one, and persists across separate copySelection()/pasteClipboard() calls.
  const clipboardRef = useRef<PostLayer[]>([]);
  const [, forceRender] = useState(0);

  // Always holds the latest `onChange` — read (not captured) by every action method so
  // a non-memoized `onChange` passed by the caller never goes stale inside a `useCallback`
  // that only rebuilds when `history.present` changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The outer persistence write (-> onPatch -> updateNodeData -> canvas store -> autosave) is the
  // expensive part, not local editing (the stage renders off `layers` above, not off a round-trip
  // through the parent) — debounce ONLY this outer notification, so rapid edits (typing, dragging a
  // color picker) collapse into one write instead of one per keystroke.
  const debouncedOnChange = useDebouncedCallback(
    (next: PostLayer[]) => onChangeRef.current(next),
    onChangeDelayMs,
  );

  const layers = liveLayersRef.current ?? history.present;

  function applyCommitted(next: PostLayer[]) {
    setHistory((h) => commitHistory(h, next));
    debouncedOnChange(next);
  }

  const selectLayer = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  const toggleLayerSelection = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);

  const addText = useCallback(() => {
    const layer = createTextLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const addShape = useCallback(() => {
    const layer = createShapeLayer();
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  // `overrides` lets a call site place the layer with its own geometry (the auto-placed
  // connected image wants a full-bleed 0,0,1,1 plate, not createImageLayer's generic
  // small default) without changing that default for the plain "Add > Image" case.
  const addImage = useCallback((src: ImageSource, overrides?: Partial<ImageLayer>) => {
    const layer = createImageLayer(src, overrides);
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
  }, [history.present]);

  const addIcon = useCallback((src: IconSource) => {
    const layer = createIconLayer(src);
    applyCommitted(addLayer(history.present, layer));
    setSelectedIds([layer.id]);
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

  // Deleting the whole current selection (one action = one undo step, matching every other
  // discrete action in this hook) — replaces the old single-id deleteLayer.
  //
  // `overrideIds` lets a caller act on a SPECIFIC id regardless of what's currently in
  // `selectedIds` state — needed by the layer list's per-row delete button, whose click
  // handler runs synchronously against this render's closure and can't rely on a
  // `selectLayer(id)` call scheduled for the next render landing in time. Falls back to
  // `selectedIds` when omitted, so every existing no-arg call site (shortcuts, context
  // menu, toolbar) is unaffected.
  const deleteSelection = useCallback((overrideIds?: string[]) => {
    const ids = overrideIds ?? selectedIds;
    if (ids.length === 0) return;
    const next = ids.reduce((acc, id) => removeLayer(acc, id), history.present);
    applyCommitted(next);
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  }, [history.present, selectedIds]);

  // Same `overrideIds` escape hatch as deleteSelection, for the same reason (layer list's
  // per-row duplicate button).
  const duplicateSelection = useCallback((overrideIds?: string[]) => {
    const ids = overrideIds ?? selectedIds;
    if (ids.length === 0) return;
    let next = history.present;
    const newIds: string[] = [];
    for (const id of ids) {
      const before = new Set(next.map((l) => l.id));
      next = duplicateLayerPure(next, id);
      const added = next.find((l) => !before.has(l.id));
      if (added) newIds.push(added.id);
    }
    applyCommitted(next);
    // Only move the selection onto the copies when duplicating the ACTUAL selection. A
    // per-row duplicate button passes overrideIds for a layer the user may not have
    // selected — retargeting there would silently replace their real selection (e.g. two
    // layers they were about to group) with one copy of an unrelated row, mirroring the
    // same conditional deleteSelection already applies to its own bookkeeping.
    if (newIds.length && !overrideIds) setSelectedIds(newIds);
  }, [history.present, selectedIds]);

  const reorder = useCallback((id: string, direction: ReorderDirection) => {
    applyCommitted(reorderLayer(history.present, id, direction));
  }, [history.present]);

  // Drag-and-drop reorder (post-layer-list.tsx) — targetIndex is in the same back-to-front
  // space as `layers`/`reorderLayerToIndex` itself; the list converts from its reversed
  // front-first display order before calling this.
  const reorderToIndex = useCallback((id: string, targetIndex: number) => {
    applyCommitted(reorderLayerToIndex(history.present, id, targetIndex));
  }, [history.present]);

  const toggleLock = useCallback((id: string) => {
    applyCommitted(toggleLockPure(history.present, id));
  }, [history.present]);

  const toggleHidden = useCallback((id: string) => {
    applyCommitted(toggleHiddenPure(history.present, id));
  }, [history.present]);

  // No-op below 2 selected layers — groupLayers itself also guards this, but bailing here
  // avoids committing a no-op history entry and clobbering the current selection.
  const group = useCallback(() => {
    if (selectedIds.length < 2) return;
    const before = new Set(history.present.map((l) => l.id));
    const next = groupLayers(history.present, selectedIds);
    const created = next.find((l) => !before.has(l.id));
    applyCommitted(next);
    if (created) setSelectedIds([created.id]);
  }, [history.present, selectedIds]);

  // Only fires when the selection is exactly one GroupLayer — ungrouping a mixed or
  // multi-group selection isn't a defined action.
  const ungroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const target = history.present.find((l) => l.id === selectedIds[0]);
    if (!target || target.kind !== "group") return;
    const childIds = target.childIds;
    applyCommitted(ungroupLayers(history.present, target.id));
    setSelectedIds(childIds);
  }, [history.present, selectedIds]);

  // Stored in a ref (not state) — copy/paste is not itself an undoable/rendered concern, and a
  // ref survives across the two separate calls without forcing a re-render on copy.
  const copySelection = useCallback(() => {
    clipboardRef.current = copyLayers(history.present, selectedIds);
  }, [history.present, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const before = new Set(history.present.map((l) => l.id));
    const next = pasteLayers(history.present, clipboardRef.current);
    const pastedIds = next.filter((l) => !before.has(l.id)).map((l) => l.id);
    applyCommitted(next);
    setSelectedIds(pastedIds);
  }, [history.present]);

  const align = useCallback((mode: AlignMode) => {
    applyCommitted(alignLayers(history.present, selectedIds, mode));
  }, [history.present, selectedIds]);

  const undo = useCallback(() => {
    let nextPresent: PostLayer[] | undefined;
    setHistory((h) => {
      const next = undoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) debouncedOnChange(nextPresent);
  }, [debouncedOnChange]);

  const redo = useCallback(() => {
    let nextPresent: PostLayer[] | undefined;
    setHistory((h) => {
      const next = redoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) debouncedOnChange(nextPresent);
  }, [debouncedOnChange]);

  // Swaps the WHOLE scene as one undo step — the template picker's "seed these layers"
  // action. Must go through the hook (not a direct onPatch by the caller): the hook seeds
  // its history once from `initialLayers`, so a caller that writes layers around it would
  // be silently overwritten by the hook's stale present on the very next edit. Also clears
  // any in-progress live gesture so a stale liveLayersRef doesn't shadow the new scene.
  const replaceAllLayers = useCallback((next: PostLayer[]) => {
    liveLayersRef.current = null;
    applyCommitted(next);
    setSelectedIds([]);
    // No history.present dependency: this REPLACES the scene rather than deriving from it.
  }, []);

  return {
    layers,
    selectedIds,
    selectLayer,
    toggleLayerSelection,
    selectMany,
    addText,
    addShape,
    addImage,
    addIcon,
    updateLayerLive,
    commitLayerChange,
    replaceAllLayers,
    deleteSelection,
    duplicateSelection,
    reorder,
    reorderToIndex,
    toggleLock,
    toggleHidden,
    group,
    ungroup,
    copySelection,
    pasteClipboard,
    align,
    undo,
    redo,
    canUndo: canUndoHistory(history),
    canRedo: canRedoHistory(history),
  };
}
