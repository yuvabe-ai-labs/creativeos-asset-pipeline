// src/hooks/use-post-editor.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { PostLayer, ImageLayer, IconLayer, ShapeLayer, ImageSource, IconSource, PostFormat, TextLayer } from "@/lib/post/types";
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

/**
 * Everything the undo stack owns. Format and templateId join layers here (D127) so a single
 * ⌘Z reverts whatever the operator actually just did — previously a format change was
 * invisible to history, and ⌘Z would silently undo an unrelated earlier layer edit instead.
 * Title is deliberately absent: it is metadata, like a filename.
 */
export type PostDesign = {
  layers: PostLayer[];
  format: PostFormat;
  templateId?: string;
};

export function usePostEditor(
  initial: PostDesign,
  onChange: (next: PostDesign) => void,
  onChangeDelayMs = 2000,
) {
  const [history, setHistory] = useState<History<PostDesign>>(() => createHistory(initial));
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
    (next: PostDesign) => onChangeRef.current(next),
    onChangeDelayMs,
  );

  const layers = liveLayersRef.current ?? history.present.layers;
  const format = history.present.format;
  const templateId = history.present.templateId;

  // Commit a new set of layers, carrying format/templateId through untouched.
  const applyLayers = useCallback((nextLayers: PostLayer[]) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      // history.commit() skips a no-op by reference equality, but it compares the whole
      // design object — and wrapping the layers in a fresh `{ ...h.present, layers }` here
      // would defeat that guard even when the pure updater short-circuited and handed back
      // the very same array (reorderLayer on a missing id, groupLayers below 2 targets,
      // alignLayers on an empty selection...). Without this check those land a duplicate
      // entry, so the next undo appears to do nothing.
      if (nextLayers === h.present.layers) return h;
      const next = commitHistory(h, { ...h.present, layers: nextLayers });
      debouncedOnChange(next.present);
      return next;
    });
  }, [debouncedOnChange]);

  const selectLayer = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  const toggleLayerSelection = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);

  const addText = useCallback((overrides?: Partial<TextLayer>) => {
    const layer = createTextLayer(overrides ?? {}, history.present.layers);
    applyLayers(addLayer(history.present.layers, layer));
    setSelectedIds([layer.id]);
  }, [history.present, applyLayers]);

  const addShape = useCallback((overrides?: Partial<ShapeLayer>) => {
    const layer = createShapeLayer(overrides ?? {}, history.present.layers);
    applyLayers(addLayer(history.present.layers, layer));
    setSelectedIds([layer.id]);
  }, [history.present, applyLayers]);

  // `overrides` lets a call site place the layer with its own geometry (the auto-placed
  // connected image wants a full-bleed 0,0,1,1 plate, not createImageLayer's generic
  // small default) without changing that default for the plain "Add > Image" case.
  const addImage = useCallback((src: ImageSource, overrides?: Partial<ImageLayer>) => {
    const layer = createImageLayer(src, overrides, history.present.layers);
    applyLayers(addLayer(history.present.layers, layer));
    setSelectedIds([layer.id]);
  }, [history.present, applyLayers]);

  // `overrides` matters here: w is a fraction of canvas WIDTH and h a fraction of HEIGHT, so a
  // literal w === h is only square on a square canvas. The caller knows the container's real
  // pixel ratio and passes a box that is actually square; without it, icons land stretched on
  // every non-square format.
  const addIcon = useCallback((src: IconSource, overrides?: Partial<IconLayer>) => {
    const layer = createIconLayer(src, overrides ?? {}, history.present.layers);
    applyLayers(addLayer(history.present.layers, layer));
    setSelectedIds([layer.id]);
  }, [history.present, applyLayers]);

  // Applies an in-progress gesture's intermediate state WITHOUT touching history — call
  // on every pointermove while dragging/resizing/rotating, or on every keystroke while
  // editing text inline. Must be followed by commitLayerChange() once the gesture ends.
  const updateLayerLive = useCallback((id: string, patch: Partial<PostLayer>) => {
    const base = liveLayersRef.current ?? history.present.layers;
    liveLayersRef.current = updateLayer(base, id, patch);
    forceRender((n) => n + 1);
  }, [history.present]);

  // Lands the gesture as ONE undo step (pointerup/blur) — the resolved "coalesced per
  // gesture" answer to post-node-design.md §17.
  const commitLayerChange = useCallback(() => {
    if (!liveLayersRef.current) return;
    const next = liveLayersRef.current;
    liveLayersRef.current = null;
    applyLayers(next);
  }, [applyLayers]);

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
    const next = ids.reduce((acc, id) => removeLayer(acc, id), history.present.layers);
    applyLayers(next);
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  }, [history.present, selectedIds, applyLayers]);

  // Same `overrideIds` escape hatch as deleteSelection, for the same reason (layer list's
  // per-row duplicate button).
  const duplicateSelection = useCallback((overrideIds?: string[]) => {
    const ids = overrideIds ?? selectedIds;
    if (ids.length === 0) return;
    let next = history.present.layers;
    const newIds: string[] = [];
    for (const id of ids) {
      const before = new Set(next.map((l) => l.id));
      next = duplicateLayerPure(next, id);
      const added = next.find((l) => !before.has(l.id));
      if (added) newIds.push(added.id);
    }
    applyLayers(next);
    // Only move the selection onto the copies when duplicating the ACTUAL selection. A
    // per-row duplicate button passes overrideIds for a layer the user may not have
    // selected — retargeting there would silently replace their real selection (e.g. two
    // layers they were about to group) with one copy of an unrelated row, mirroring the
    // same conditional deleteSelection already applies to its own bookkeeping.
    if (newIds.length && !overrideIds) setSelectedIds(newIds);
  }, [history.present, selectedIds, applyLayers]);

  const reorder = useCallback((id: string, direction: ReorderDirection) => {
    applyLayers(reorderLayer(history.present.layers, id, direction));
  }, [history.present, applyLayers]);

  // Drag-and-drop reorder (post-layer-list.tsx) — targetIndex is in the same back-to-front
  // space as `layers`/`reorderLayerToIndex` itself; the list converts from its reversed
  // front-first display order before calling this.
  const reorderToIndex = useCallback((id: string, targetIndex: number) => {
    applyLayers(reorderLayerToIndex(history.present.layers, id, targetIndex));
  }, [history.present, applyLayers]);

  const toggleLock = useCallback((id: string) => {
    applyLayers(toggleLockPure(history.present.layers, id));
  }, [history.present, applyLayers]);

  const toggleHidden = useCallback((id: string) => {
    applyLayers(toggleHiddenPure(history.present.layers, id));
  }, [history.present, applyLayers]);

  // No-op below 2 selected layers — groupLayers itself also guards this, but bailing here
  // avoids committing a no-op history entry and clobbering the current selection.
  const group = useCallback(() => {
    if (selectedIds.length < 2) return;
    const before = new Set(history.present.layers.map((l) => l.id));
    const next = groupLayers(history.present.layers, selectedIds);
    const created = next.find((l) => !before.has(l.id));
    applyLayers(next);
    if (created) setSelectedIds([created.id]);
  }, [history.present, selectedIds, applyLayers]);

  // Only fires when the selection is exactly one GroupLayer — ungrouping a mixed or
  // multi-group selection isn't a defined action.
  const ungroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const target = history.present.layers.find((l) => l.id === selectedIds[0]);
    if (!target || target.kind !== "group") return;
    const childIds = target.childIds;
    applyLayers(ungroupLayers(history.present.layers, target.id));
    setSelectedIds(childIds);
  }, [history.present, selectedIds, applyLayers]);

  // Stored in a ref (not state) — copy/paste is not itself an undoable/rendered concern, and a
  // ref survives across the two separate calls without forcing a re-render on copy.
  const copySelection = useCallback(() => {
    clipboardRef.current = copyLayers(history.present.layers, selectedIds);
  }, [history.present, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const before = new Set(history.present.layers.map((l) => l.id));
    const next = pasteLayers(history.present.layers, clipboardRef.current);
    const pastedIds = next.filter((l) => !before.has(l.id)).map((l) => l.id);
    applyLayers(next);
    setSelectedIds(pastedIds);
  }, [history.present, applyLayers]);

  const align = useCallback((mode: AlignMode) => {
    applyLayers(alignLayers(history.present.layers, selectedIds, mode));
  }, [history.present, selectedIds, applyLayers]);

  const undo = useCallback(() => {
    let nextPresent: PostDesign | undefined;
    setHistory((h) => {
      const next = undoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) debouncedOnChange(nextPresent);
  }, [debouncedOnChange]);

  const redo = useCallback(() => {
    let nextPresent: PostDesign | undefined;
    setHistory((h) => {
      const next = redoHistory(h);
      nextPresent = next.present;
      return next;
    });
    if (nextPresent !== undefined) debouncedOnChange(nextPresent);
  }, [debouncedOnChange]);

  // Swaps the WHOLE scene as one undo step — the template picker's "seed these layers"
  // action. Must go through the hook (not a direct onPatch by the caller): the hook seeds
  // its history once from `initial`, so a caller that writes layers around it would
  // be silently overwritten by the hook's stale present on the very next edit. Also clears
  // any in-progress live gesture so a stale liveLayersRef doesn't shadow the new scene.
  //
  // `nextTemplateId` lets template application land as ONE undo step instead of two
  // (layers + templateId separately) — omit it for plain "replace layers" call sites.
  // Pass `null` to actively CLEAR the template (starting from blank): `undefined` has to keep
  // the current one, since that is what every plain call site means by omitting the argument.
  const replaceAllLayers = useCallback((nextLayers: PostLayer[], nextTemplateId?: string | null) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      const next = commitHistory(h, {
        ...h.present,
        layers: nextLayers,
        templateId: nextTemplateId === undefined ? h.present.templateId : (nextTemplateId ?? undefined),
      });
      debouncedOnChange(next.present);
      return next;
    });
    setSelectedIds([]);
    // No history.present dependency: this REPLACES the scene rather than deriving from it.
  }, [debouncedOnChange]);

  const setFormat = useCallback((next: PostFormat) => {
    liveLayersRef.current = null;
    setHistory((h) => {
      if (h.present.format === next) return h;
      const committed = commitHistory(h, { ...h.present, format: next });
      debouncedOnChange(committed.present);
      return committed;
    });
  }, [debouncedOnChange]);

  const setTemplateId = useCallback((next: string | undefined) => {
    setHistory((h) => {
      if (h.present.templateId === next) return h;
      const committed = commitHistory(h, { ...h.present, templateId: next });
      debouncedOnChange(committed.present);
      return committed;
    });
  }, [debouncedOnChange]);

  return {
    layers,
    format,
    templateId,
    setFormat,
    setTemplateId,
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
