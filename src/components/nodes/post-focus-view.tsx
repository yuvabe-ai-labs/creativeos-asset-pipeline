// src/components/nodes/post-focus-view.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Layers as LayersIcon, Palette, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type Konva from "konva";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isEditableTarget } from "@/lib/canvas-node-options";
import type { PostNodeData } from "@/lib/canvas-nodes";
import type { PostLayer } from "@/lib/post/types";
import { POST_FORMATS } from "@/lib/post/formats";
import type { PostFormat } from "@/lib/post/types";
import type { PostTemplate } from "@/lib/post/templates";
import { nudge } from "@/lib/post/geometry";
import { usePostEditor } from "@/hooks/use-post-editor";
import { usePostExport } from "@/hooks/use-post-export";
import { EditableField } from "./editable-field";
import { PostStage } from "./post-stage";
import { PostLayerList } from "./post-layer-list";
import { PostAddMenu } from "./post-add-menu";
import { PostInspector } from "./post-inspector";
import { PostBrandTabStub } from "./post-brand-tab-stub";
import { PostTemplatePicker } from "./post-template-picker";
import { PostLayerContextMenu } from "./post-layer-context-menu";

type ConnectedImageNode = { nodeId: string; url: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  format?: PostFormat;
  templateId?: string;
  layers?: PostLayer[];
  autoPlacedNodeIds?: string[];
  connectedImageNodes: ConnectedImageNode[];
  onPatch: (patch: Partial<PostNodeData>) => void;
};

const STAGE_MAX_PX = 640; // the stage scales to fit within this box, never renders at full format px

// KeyboardEvent.key -> the `nudge()` direction token.
const ARROW_DIRECTIONS: Record<string, "up" | "down" | "left" | "right" | undefined> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function layerKindLabel(layer: PostLayer): string {
  switch (layer.kind) {
    case "text": return "Text";
    case "shape": return "Shape";
    case "image": return "Image";
    case "icon": return "Icon";
    case "group": return "Group";
  }
}

export function PostFocusView({
  open, onOpenChange, nodeId, title, format, templateId, layers: persistedLayers,
  autoPlacedNodeIds, connectedImageNodes, onPatch,
}: Props) {
  const formatSpec = POST_FORMATS[format ?? "ig-square"];
  const scale = Math.min(1, STAGE_MAX_PX / Math.max(formatSpec.width, formatSpec.height));
  const containerW = formatSpec.width * scale;
  const containerH = formatSpec.height * scale;

  const { layers, selectedIds, selectLayer, toggleLayerSelection, selectMany, addText, addShape,
    addImage, addIcon, updateLayerLive, commitLayerChange, replaceAllLayers, deleteSelection,
    duplicateSelection, reorder, reorderToIndex, toggleLock, toggleHidden, group, ungroup,
    copySelection, pasteClipboard, align, undo, redo, canUndo, canRedo,
  } = usePostEditor(persistedLayers ?? [], (next) => onPatch({ layers: next }));

  const [rail, setRail] = useState<"layers" | "brand">("layers");
  // Captured ONCE, lazily, from the TRUE initial scene — never re-derived from
  // `layers.length`, so the auto-place effect adding the first layer can't close the
  // picker out from under the operator, and "Start blank" has something real to turn off.
  const [pickerOpen, setPickerOpen] = useState(() => (persistedLayers ?? []).length === 0);
  const stageRef = useRef<Konva.Stage>(null);

  // Reported by post-image-layer.tsx (via PostStage's onImageLoaded) once each image
  // bitmap finishes loading — threaded into PostInspectorImage's "reset to original
  // proportions" action. Keyed by layer id since multiple image layers can be loaded at
  // once. `handleImageLoaded` uses the functional setState form so it never needs the
  // current map in its closure, keeping its useCallback deps empty and its identity
  // permanently stable — required so PostImageLayer's `[image, layer.id, onImageLoaded]`
  // effect doesn't re-fire on every unrelated PostFocusView re-render.
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { width: number; height: number }>>({});
  const handleImageLoaded = useCallback((layerId: string, naturalW: number, naturalH: number) => {
    setNaturalSizes((prev) => ({ ...prev, [layerId]: { width: naturalW, height: naturalH } }));
  }, []);

  // Whether anything has been copied/cut this session — the hook's clipboard is a plain
  // ref (deliberately non-reactive, see use-post-editor.ts), so this local flag is what
  // drives the context menu's "Paste" enabled state. Paste itself already no-ops safely
  // when the clipboard is empty, so this only affects the menu item's disabled styling.
  const [hasClipboard, setHasClipboard] = useState(false);

  const { downloadPng, isExporting } = usePostExport({
    nodeId,
    stageRef,
    format: format ?? "ig-square",
    title,
    onDeselect: () => selectLayer(null),
    onPatch,
  });

  // Auto-place the first connected image, per the product decision: a Post node starts
  // empty, and connecting an image node makes it show up immediately, without a manual
  // drag step — matching how Image Gen already treats a connected base image.
  //
  // Fires AT MOST ONCE per source node, recorded durably in `autoPlacedNodeIds` (not just
  // "is there a layer bound to it right now?"): otherwise deleting the auto-placed layer
  // would make the very next nodes/edges change re-add it, and the layer could never be
  // removed. The current-layer check stays as a second guard for scenes authored before
  // the field existed, and so a deliberate swap is never fought.
  useEffect(() => {
    if (connectedImageNodes.length === 0) return;
    const placed = autoPlacedNodeIds ?? [];
    const target = connectedImageNodes.find((c) => !placed.includes(c.nodeId));
    if (!target) return;
    const alreadyBound = layers.some((l) => {
      if (l.kind !== "image" || l.src.kind !== "node") return false;
      const src = l.src;
      return connectedImageNodes.some((c) => c.nodeId === src.nodeId);
    });
    if (alreadyBound) return;
    // Full-bleed plate — createImageLayer's default geometry is the generic small text-
    // layer box, which lands a connected photo as a tiny squashed strip.
    addImage({ kind: "node", nodeId: target.nodeId }, { x: 0, y: 0, w: 1, h: 1 });
    onPatch({ autoPlacedNodeIds: [...placed, target.nodeId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedImageNodes, autoPlacedNodeIds]);

  function resolveNodeImageUrl(nodeId: string): string | undefined {
    return connectedImageNodes.find((c) => c.nodeId === nodeId)?.url;
  }

  function handlePickTemplate(template: PostTemplate) {
    const seeded = template.seedLayers(format ?? "ig-square");
    // Preserve any connected-node-sourced image (auto-placed once per source, per
    // autoPlacedNodeIds) — no template seeds its own image layer, so replacing wholesale
    // would silently discard the plate with no way to bring it back (the auto-place
    // effect never re-fires for a source it already recorded). Keep it at the back so
    // the template's own shapes/text layer on top of it as intended.
    const keptImages = layers.filter((l) => l.kind === "image" && l.src.kind === "node");
    // Layers go through the editor's own history (which owns them); templateId is not
    // part of that state, so it stays a plain patch.
    replaceAllLayers([...keptImages, ...seeded]);
    onPatch({ templateId: template.id });
    setPickerOpen(false);
  }

  function handleRenameLayer(id: string, name: string) {
    updateLayerLive(id, { name });
    commitLayerChange();
  }

  const showTemplatePicker = pickerOpen;
  // Only populated for exactly one selected layer — a 2+ selection intentionally has no
  // single "the" layer (see PostInspector's own selectedCount-driven states below).
  const selectedLayer = selectedIds.length === 1
    ? layers.find((l) => l.id === selectedIds[0]) ?? null
    : null;

  // Keyboard shortcuts — guarded against typing in a field (isEditableTarget), same
  // pattern the canvas itself already uses for its own shortcuts.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target as HTMLElement)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) { e.preventDefault(); deleteSelection(); }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (selectedIds.length > 0) { e.preventDefault(); duplicateSelection(); }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroup(); else group();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        setHasClipboard(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        copySelection();
        deleteSelection();
        setHasClipboard(true);
      } else if (e.key === "]" && selectedIds.length === 1) {
        // Reordering (front/forward/backward/back) has no bulk primitive in
        // lib/post/layers.ts — gated to a single selection, same as ungroup, rather than
        // looping the hook's single-id action across a multi-select (which would land as
        // several separate undo steps for one keypress).
        reorder(selectedIds[0], e.shiftKey ? "front" : "forward");
      } else if (e.key === "[" && selectedIds.length === 1) {
        reorder(selectedIds[0], e.shiftKey ? "back" : "backward");
      } else if (ARROW_DIRECTIONS[e.key] && selectedIds.length > 0) {
        // Arrow keys nudge 1px, shift-arrow 10px (§5). preventDefault stops the sheet
        // scrolling underneath. A nudge is discrete, like a click — commit it as its own
        // undo step immediately rather than coalescing a run of presses. Unlike reorder
        // above, nudging composes cleanly across a multi-select: updateLayerLive can be
        // called once per layer against the same in-progress live snapshot, then landed
        // as ONE commitLayerChange() — so every selected (unlocked) layer moves together.
        const direction = ARROW_DIRECTIONS[e.key]!;
        e.preventDefault();
        const targets = layers.filter((l) => selectedIds.includes(l.id) && !l.locked);
        if (targets.length === 0) return;
        for (const layer of targets) {
          updateLayerLive(layer.id, nudge(layer, direction, containerW, containerH, e.shiftKey));
        }
        commitLayerChange();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedIds, layers, containerW, containerH, updateLayerLive, commitLayerChange,
      deleteSelection, duplicateSelection, undo, redo, reorder, group, ungroup, copySelection,
      pasteClipboard]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-6xl px-6 pb-4 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>
            <header className="mt-3 flex items-center justify-between gap-4">
              <SheetTitle className="p-0 font-display text-2xl font-semibold tracking-tight">
                <EditableField
                  value={title || ""}
                  onCommit={(t) => onPatch({ title: t })}
                  placeholder="Untitled post"
                  className="font-display text-2xl font-semibold tracking-tight"
                />
              </SheetTitle>
              <div className="flex items-center gap-2">
                <Select
                  value={format ?? "ig-square"}
                  onValueChange={(v) => {
                    const next = v as PostFormat;
                    const from = POST_FORMATS[format ?? "ig-square"];
                    const to = POST_FORMATS[next];
                    const ratioDelta = Math.abs(from.width / from.height - to.width / to.height);
                    // R1.6: warn, never block, on a large aspect-ratio change — normalized
                    // geometry re-fits automatically, but a big ratio jump (e.g. square ->
                    // story) can still look wrong and the operator should know to check it.
                    if (ratioDelta > 0.3) {
                      toast.warning("Big aspect-ratio change — check the layout before downloading.");
                    }
                    onPatch({ format: next });
                  }}
                >
                  <SelectTrigger className="w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(POST_FORMATS).map(([key, spec]) => (
                      <SelectItem key={key} value={key} className="text-xs">{spec.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" disabled={!canUndo} onClick={undo} aria-label="Undo">
                  <Undo2 className="size-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={!canRedo} onClick={redo} aria-label="Redo">
                  <Redo2 className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  Change template
                </Button>
                <Button variant="outline" size="sm" disabled title="Publishing is coming soon">
                  Publish
                </Button>
                <Button size="sm" onClick={downloadPng} disabled={isExporting}>
                  {isExporting ? "Exporting…" : "Download"}
                </Button>
              </div>
            </header>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Icon rail */}
          <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-border py-3">
            <Button
              variant="ghost" size="icon"
              className={cn(rail === "layers" && "bg-primary/10 text-primary")}
              onClick={() => setRail("layers")}
              aria-label="Layers"
            >
              <LayersIcon className="size-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className={cn(rail === "brand" && "bg-primary/10 text-primary")}
              onClick={() => setRail("brand")}
              aria-label="Brand Kit"
            >
              <Palette className="size-4" />
            </Button>
            <div className="mt-auto">
              <PostAddMenu
                nodeId={nodeId}
                onAddText={addText}
                onAddShape={addShape}
                onAddImageUrl={(url) => addImage({ kind: "url", url })}
                onAddIcon={addIcon}
              />
            </div>
          </div>

          {/* Left panel */}
          <div className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-r border-border p-3">
            {rail === "layers" ? (
              <PostLayerList
                layers={layers}
                selectedIds={selectedIds}
                onSelect={selectLayer}
                onToggleSelect={toggleLayerSelection}
                onRename={handleRenameLayer}
                onReorder={reorder}
                onReorderToIndex={reorderToIndex}
                onToggleLock={toggleLock}
                onToggleHidden={toggleHidden}
                onDuplicate={(id) => duplicateSelection([id])}
                onDelete={(id) => deleteSelection([id])}
              />
            ) : (
              <PostBrandTabStub />
            )}
          </div>

          {/* Stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/10 p-6">
            <PostLayerContextMenu
              hasSelection={selectedIds.length > 0}
              canGroup={selectedIds.length >= 2}
              canUngroup={selectedIds.length === 1 && selectedLayer?.kind === "group"}
              canPaste={hasClipboard}
              isLocked={selectedIds.length === 1 && (selectedLayer?.locked ?? false)}
              onCut={() => { copySelection(); deleteSelection(); setHasClipboard(true); }}
              onCopy={() => { copySelection(); setHasClipboard(true); }}
              onPaste={pasteClipboard}
              onDuplicate={() => duplicateSelection()}
              onDelete={() => deleteSelection()}
              onToggleLock={() => { if (selectedIds.length === 1) toggleLock(selectedIds[0]); }}
              onReorder={(direction) => { if (selectedIds.length === 1) reorder(selectedIds[0], direction); }}
              onGroup={group}
              onUngroup={ungroup}
              onAlign={align}
            >
              <PostStage
                layers={layers}
                containerW={containerW}
                containerH={containerH}
                selectedIds={selectedIds}
                onSelect={selectLayer}
                onToggleSelect={toggleLayerSelection}
                onSelectMany={selectMany}
                resolveNodeImageUrl={resolveNodeImageUrl}
                updateLayerLive={updateLayerLive}
                commitLayerChange={commitLayerChange}
                stageRef={stageRef}
                onCommitText={(id, text) => { updateLayerLive(id, { text } as Partial<PostLayer>); commitLayerChange(); }}
                onImageLoaded={handleImageLoaded}
              />
            </PostLayerContextMenu>
            <PostTemplatePicker
              open={showTemplatePicker}
              onPick={handlePickTemplate}
              onStartBlank={() => setPickerOpen(false)}
            />
          </div>

          {/* Inspector — the shell (width/header) always renders regardless of selection
              state; only the content below the header changes across 0/1/2+ selected. */}
          <div className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-l border-border p-3">
            <div className="text-eyebrow mb-2 !text-[0.6rem] text-muted-foreground">
              {selectedIds.length === 0
                ? "Inspector"
                : selectedIds.length > 1
                  ? `${selectedIds.length} layers selected`
                  : selectedLayer ? layerKindLabel(selectedLayer) : "Inspector"}
            </div>
            <PostInspector
              layer={selectedLayer}
              selectedCount={selectedIds.length}
              onChange={(patch) => {
                if (selectedLayer) { updateLayerLive(selectedLayer.id, patch); commitLayerChange(); }
              }}
              naturalSize={selectedLayer ? naturalSizes[selectedLayer.id] : undefined}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
