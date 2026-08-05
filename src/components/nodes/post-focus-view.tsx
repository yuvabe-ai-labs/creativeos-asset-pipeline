// src/components/nodes/post-focus-view.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type Konva from "konva";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { isEditableTarget } from "@/lib/canvas-node-options";
import type { PostNodeData } from "@/lib/canvas-nodes";
import type { PostLayer, ImageLayer } from "@/lib/post/types";
import { POST_FORMATS, resolveFormat } from "@/lib/post/formats";
import type { PostFormat } from "@/lib/post/types";
import type { PostTemplate } from "@/lib/post/templates";
import { nudge } from "@/lib/post/geometry";
import { pxToNormalized } from "@/lib/post/units";
import { usePostEditor } from "@/hooks/use-post-editor";
import { usePostExport } from "@/hooks/use-post-export";
import { EditableField } from "./editable-field";
import { PostStage } from "./post-stage";
import { PostInspector } from "./post-inspector";
import { PostBrandTabStub } from "./post-brand-tab-stub";
import { PostLayerContextMenu } from "./post-layer-context-menu";
import { PostToolRail, type PostTool } from "./post-tool-rail";
import { PostToolPanel } from "./post-tool-panel";
import { PostPanelSizes } from "./post-panel-sizes";
import { PostPanelTemplates } from "./post-panel-templates";
import { PostPanelElements } from "./post-panel-elements";
import { PostPanelText } from "./post-panel-text";
import { PostPanelConnected, CONNECTED_DRAG_TYPE } from "./post-panel-connected";
import { PostPanelLayers } from "./post-panel-layers";

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


export function PostFocusView({
  open, onOpenChange, nodeId, title, format, templateId, layers: persistedLayers,
  autoPlacedNodeIds, connectedImageNodes, onPatch,
}: Props) {
  const { layers, format: editorFormat, templateId: editorTemplateId, setFormat,
    selectedIds, selectLayer, toggleLayerSelection, selectMany, addText, addShape,
    addImage, addIcon, updateLayerLive, commitLayerChange, replaceAllLayers, deleteSelection,
    duplicateSelection, reorder, reorderToIndex, toggleLock, toggleHidden, group, ungroup,
    copySelection, pasteClipboard, align, undo, redo, canUndo, canRedo,
  } = usePostEditor(
    // The hook's history owns the whole design — layers, format AND templateId. It seeds
    // itself from these props once and is the source of truth from then on, so everything
    // below must read `editorFormat` and write through `setFormat`/`replaceAllLayers`
    // rather than calling onPatch for those fields directly: the hook writes all three back
    // out on every debounced save, so a direct onPatch is silently reverted a moment later
    // by the hook's own (never-updated) copy.
    {
      layers: persistedLayers ?? [],
      format: resolveFormat(format),
      templateId,
    },
    (next) => onPatch({ layers: next.layers, format: next.format, templateId: next.templateId }),
  );

  const formatSpec = POST_FORMATS[editorFormat];
  const scale = Math.min(1, STAGE_MAX_PX / Math.max(formatSpec.width, formatSpec.height));
  const containerW = formatSpec.width * scale;
  const containerH = formatSpec.height * scale;

  /**
   * A box that is actually square ON CANVAS.
   *
   * `w` is a fraction of canvas width and `h` a fraction of canvas height, so `w === h` only
   * looks square on a square format — on a 4:5 portrait a "0.08 × 0.08" icon renders 86×108px,
   * and on a 9:16 story it's badly stretched. Scaling h by the container's own aspect gives
   * equal pixels on every format.
   */
  function squareBox(widthFraction: number) {
    return { w: widthFraction, h: (widthFraction * containerW) / containerH };
  }

  // Templates open by default so the next step is discoverable, but nothing is applied
  // until the operator clicks a template — a Post node opens on a clean canvas showing
  // only its connected image (D117).
  const [tool, setTool] = useState<PostTool | null>("templates");
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
    // The editor's live format, not the prop: the prop only catches up after the debounced
    // save round-trips, so exporting right after a format change would render the OLD size.
    format: editorFormat,
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
    // Seed for the format actually on screen — templates tune their layout per aspect band,
    // so seeding from the lagging prop would compose for the wrong shape.
    const seeded = template.seedLayers(editorFormat);
    // Defensive: a template that hasn't declared a slot still applies, it just leaves the
    // photo full-bleed at the back the way it used to. Better a plainer composition than a
    // thrown error from `undefined(...)`.
    const slot = template.imageSlot?.(editorFormat)
      ?? { x: 0, y: 0, w: 1, h: 1, fit: "cover" as const, index: 0 };

    // Compose the connected photo INTO the template rather than leaving it wherever it was.
    // Previously it stayed full-bleed underneath, so a layout built around an inset plate or
    // a half-frame image never actually composed — which defeats the point of a template.
    // The template declares the slot; we move the photo there and splice it in at the depth
    // the template asked for (behind a scrim, or above a background block but below copy).
    const connected = layers.filter(
      (l): l is ImageLayer => l.kind === "image" && l.src.kind === "node",
    );
    const [plate, ...extraImages] = connected;

    const next = [...seeded];
    if (plate) {
      const framed: ImageLayer = {
        ...plate,
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        rotation: 0,
        fit: slot.fit,
        radius: slot.radius,
      };
      next.splice(Math.min(slot.index, next.length), 0, framed);
    }
    // Any further connected images keep their own geometry at the back — a template only
    // describes a home for one photo, and silently dropping the rest would lose work.
    replaceAllLayers([...extraImages, ...next], template.id);
  }

  function handleRenameLayer(id: string, name: string) {
    updateLayerLive(id, { name });
    commitLayerChange();
  }

  // R1.6: warn, never block, on a large aspect-ratio change — normalized geometry re-fits
  // automatically, but a big ratio jump (e.g. square -> story) can still look wrong and the
  // operator should know to check it.
  function handleSelectFormat(next: PostFormat) {
    const from = POST_FORMATS[editorFormat];
    const to = POST_FORMATS[next];
    const ratioDelta = Math.abs(from.width / from.height - to.width / to.height);
    if (ratioDelta > 0.3) {
      toast.warning("Big aspect-ratio change — check the layout before downloading.");
    }
    // Through the hook, never a bare onPatch: the hook owns format and writes its own copy
    // back on every save, so a direct patch is reverted seconds later. Going through
    // setFormat also makes the change undoable.
    setFormat(next);
  }

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
                <Button variant="outline" size="icon" disabled={!canUndo} onClick={undo} aria-label="Undo">
                  <Undo2 className="size-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={!canRedo} onClick={redo} aria-label="Redo">
                  <Redo2 className="size-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setTool(tool === "templates" ? null : "templates")}
                >
                  Change template
                </Button>
                <Button variant="outline" size="sm" disabled title="Publishing is coming soon">
                  Publish <span className="ml-1 text-[0.6rem] opacity-70">soon</span>
                </Button>
                <Button size="sm" onClick={downloadPng} disabled={isExporting}>
                  {isExporting ? "Exporting…" : "Download"}
                </Button>
              </div>
            </header>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <PostToolRail active={tool} onSelect={setTool} />
          <PostToolPanel tool={tool}>
            {tool === "templates" && (
              <PostPanelTemplates
                activeTemplateId={editorTemplateId}
                format={editorFormat}
                onApply={handlePickTemplate}
              />
            )}
            {tool === "sizes" && <PostPanelSizes format={editorFormat} onSelect={handleSelectFormat} />}
            {tool === "elements" && (
              <PostPanelElements
                nodeId={nodeId}
                onAddShape={addShape}
                onAddIcon={(src) => addIcon(src, squareBox(0.16))}
                // Uploaded images land in a generous square too, rather than the generic
                // wide-and-short default box, which squashed them into a strip.
                onAddImageUrl={(url) => addImage({ kind: "url", url }, squareBox(0.5))}
              />
            )}
            {tool === "text" && <PostPanelText onAddText={(preset) => addText(preset)} />}
            {tool === "connected" && (
              <PostPanelConnected
                nodes={connectedImageNodes}
                onAdd={(nodeId) => addImage({ kind: "node", nodeId })}
              />
            )}
            {tool === "layers" && (
              <PostPanelLayers
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
            )}
            {tool === "brand" && <PostBrandTabStub />}
          </PostToolPanel>

          {/* Stage */}
          <div
            className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/10 p-6"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(CONNECTED_DRAG_TYPE)) e.preventDefault();
            }}
            onDrop={(e) => {
              const droppedNodeId = e.dataTransfer.getData(CONNECTED_DRAG_TYPE);
              if (!droppedNodeId) return;
              e.preventDefault();
              const stageBox = stageRef.current?.container().getBoundingClientRect();
              if (!stageBox) return;
              // The drop point becomes the new layer's CENTRE, so the image lands under the
              // cursor rather than starting there and extending down-right.
              const w = 0.4;
              const h = 0.4;
              const cx = pxToNormalized(e.clientX - stageBox.left, stageBox.width);
              const cy = pxToNormalized(e.clientY - stageBox.top, stageBox.height);
              addImage(
                { kind: "node", nodeId: droppedNodeId },
                {
                  x: Math.min(Math.max(cx - w / 2, 0), 1 - w),
                  y: Math.min(Math.max(cy - h / 2, 0), 1 - h),
                  w, h,
                },
              );
            }}
          >
            <PostLayerContextMenu
              hasSelection={selectedIds.length > 0}
              canGroup={selectedIds.length >= 2}
              canUngroup={selectedIds.length === 1 && selectedLayer?.kind === "group"}
              canPaste={hasClipboard}
              isLocked={selectedIds.length === 1 && (selectedLayer?.locked ?? false)}
              canToggleLock={selectedIds.length === 1}
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
          </div>

          {/* Inspector — the shell (width/header) always renders regardless of selection
              state; only the content below the header changes across 0/1/2+ selected. */}
          <div className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-l border-border p-3">
            {/* No heading here — PostInspector's own Shell renders it, for every selection
                state. Having one here too printed the layer kind twice ("TEXT / TEXT"). */}
            <PostInspector
              layer={selectedLayer}
              selectedCount={selectedIds.length}
              onChange={(patch) => {
                if (selectedLayer) { updateLayerLive(selectedLayer.id, patch); commitLayerChange(); }
              }}
              // Dragging a slider fires continuously. Updating live without committing keeps
              // the canvas responsive while leaving the whole drag as ONE undo step — the
              // same coalescing the stage already does for a drag/resize gesture. Committing
              // per step would make undoing one slider drag take dozens of presses.
              onPreview={(patch) => {
                if (selectedLayer) updateLayerLive(selectedLayer.id, patch);
              }}
              naturalSize={selectedLayer ? naturalSizes[selectedLayer.id] : undefined}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
