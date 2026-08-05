// src/components/nodes/post-focus-view.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type Konva from "konva";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isEditableTarget } from "@/lib/canvas-node-options";
import type { PostNodeData } from "@/lib/canvas-nodes";
import type { PostLayer, ImageLayer } from "@/lib/post/types";
import { POST_FORMATS, resolveFormat } from "@/lib/post/formats";
import type { PostFormat } from "@/lib/post/types";
import type { PostTemplate } from "@/lib/post/templates";
import { nudge } from "@/lib/post/geometry";
import { pxToNormalized } from "@/lib/post/units";
import { DEFAULT_GEOMETRY } from "@/lib/post/layers";
import {
  ELEMENT_DRAG_TYPE, parseElementDrag, type ElementDragPayload,
} from "@/lib/post/element-drag";
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
import { PostPanelConnected } from "./post-panel-connected";
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

/**
 * Breathing room between the artboard and the panels flanking it, and how much of the
 * remaining space the artboard is allowed to fill. Short of 1 so the canvas never looks
 * wedged between the rail and the inspector.
 */
const STAGE_GUTTER_PX = 28;
const STAGE_FILL = 0.94;
/** Only used for the very first paint, before the stage area has been measured. */
const STAGE_FALLBACK_PX = 520;

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

  // Fit the artboard to whatever space the panels actually leave, measured rather than
  // assumed. A fixed size can't work: the sheet is a fraction of the viewport, the flyout
  // panel opens and closes, and formats range from 16:9 to 9:16 — so a constant that fits a
  // wide post on a large display overflows a tall one on a laptop, which is what turned the
  // canvas area into a scroller.
  const stageAreaRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  // `offCentre` is how far this area's midpoint sits from the whole editor body's midpoint —
  // see the `stageShift` note below for why the artboard needs it.
  const [stageArea, setStageArea] = useState({ w: 0, h: 0, offCentre: 0 });
  useEffect(() => {
    const el = stageAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const body = bodyRef.current;
      // Measured in the same callback as the resize: opening or closing the flyout is the only
      // thing that moves this area, and it necessarily resizes it too, so there is no offset
      // change this can miss.
      const offCentre = body
        ? body.getBoundingClientRect().left + body.getBoundingClientRect().width / 2
          - (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2)
        : 0;
      setStageArea({ w: width, h: height, offCentre });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const availW = Math.max(0, stageArea.w - STAGE_GUTTER_PX * 2) * STAGE_FILL;
  const availH = Math.max(0, stageArea.h - STAGE_GUTTER_PX * 2) * STAGE_FILL;
  const scale =
    availW > 0 && availH > 0
      // Never upscale past the format's own pixels — a 1:1 cap keeps a small format crisp
      // instead of blowing it up to fill a large display.
      ? Math.min(availW / formatSpec.width, availH / formatSpec.height, 1)
      : Math.min(1, STAGE_FALLBACK_PX / Math.max(formatSpec.width, formatSpec.height));
  const containerW = formatSpec.width * scale;
  const containerH = formatSpec.height * scale;

  /**
   * Nudge the artboard back onto the editor's true centre line.
   *
   * The stage area is the flex remainder between the rail + flyout on the left and the
   * inspector on the right, and those two sides are never the same width — so centring the
   * artboard *within the remainder* leaves it visibly off-centre in the window, and it jumps
   * sideways every time the flyout is toggled. Shifting by the measured offset centres it on
   * the editor instead, and pins it there across the toggle.
   *
   * Clamped so the artboard can never slide under a panel: when there isn't enough slack for
   * the full correction, it takes as much as fits and stays fully inside its own area.
   */
  const maxShift = Math.max(0, (stageArea.w - containerW) / 2 - STAGE_GUTTER_PX);
  const stageShift = Math.min(Math.max(stageArea.offCentre, -maxShift), maxShift);

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

  /**
   * The box each kind of element gets when it lands. Kept apart from `addElement` only so the
   * size rules read as one list; a field left out falls back to DEFAULT_GEOMETRY's.
   */
  function elementSize(p: ElementDragPayload): { w?: number; h?: number } {
    switch (p.kind) {
      case "shape":
        // Round and radial primitives need a genuinely square box or they land as ovals; a
        // rule or arrow wants a wide, short one. A rectangle keeps the generic default.
        if (p.shape === "ellipse" || p.shape === "star" || p.shape === "diamond" || p.shape === "triangle")
          return squareBox(0.3);
        if (p.shape === "line" || p.shape === "arrow") return { w: 0.4, h: 0.06 };
        return {};
      case "icon":
        // 16% of the canvas width landed a phone glyph the size of a headline. An icon is a
        // supporting mark next to copy, not a hero element — it can always be scaled up.
        return squareBox(0.09);
      // Photos land in a generous square rather than the generic wide-and-short default box,
      // which squashed them into a strip.
      case "image":
        return squareBox(0.5);
      case "connected":
        return squareBox(0.4);
      case "text":
        // The preset carries its own height, tuned to its font size. Returned only when it
        // actually has one: an explicit `h: undefined` in the overrides would beat
        // DEFAULT_GEOMETRY's height in the spread and leave the layer with no height at all.
        return p.preset.h === undefined ? {} : { h: p.preset.h };
    }
  }

  /**
   * THE one way an element gets added, whether it was clicked in a panel or dragged onto the
   * canvas — so a dropped star is the same star a clicked one is, and a new element kind needs
   * its size decided once rather than once per entry point.
   *
   * `centre` is the drop point in normalized canvas coords. The element is centred on it, so it
   * lands under the cursor instead of starting there and extending down-right, and is clamped
   * to stay fully on the artboard when dropped near an edge (or outside it, in the grey).
   */
  function addElement(p: ElementDragPayload, centre?: { x: number; y: number }) {
    const size = elementSize(p);
    const w = size.w ?? DEFAULT_GEOMETRY.w;
    const h = size.h ?? DEFAULT_GEOMETRY.h;
    const at = centre
      ? {
          x: Math.min(Math.max(centre.x - w / 2, 0), 1 - w),
          y: Math.min(Math.max(centre.y - h / 2, 0), 1 - h),
        }
      : {};
    const geo = { ...size, ...at };
    switch (p.kind) {
      case "shape": return addShape({ shape: p.shape, ...geo });
      case "icon": return addIcon(p.src, geo);
      case "text": return addText({ ...p.preset, ...geo });
      case "image": return addImage({ kind: "url", url: p.url }, geo);
      case "connected": return addImage({ kind: "node", nodeId: p.nodeId }, geo);
    }
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

  // "Blank" is the escape hatch from a template: every template is a starting point, and
  // without this the only way back to an empty canvas was deleting layers one at a time.
  // The connected photo is kept — it is the reason the node exists and is not the operator's
  // to lose — and reset to full-bleed so it reads as a clean slate rather than as the last
  // template's crop.
  function handleStartBlank() {
    const connected = layers.filter(
      (l): l is ImageLayer => l.kind === "image" && l.src.kind === "node",
    );
    replaceAllLayers(
      connected.map((l) => ({
        ...l,
        x: 0, y: 0, w: 1, h: 1,
        rotation: 0,
        fit: "cover" as const,
        radius: undefined,
      })),
      null,
    );
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

        <div ref={bodyRef} className="flex min-h-0 flex-1">
          <PostToolRail active={tool} onSelect={setTool} />
          <PostToolPanel tool={tool}>
            {tool === "templates" && (
              <PostPanelTemplates
                activeTemplateId={editorTemplateId}
                format={editorFormat}
                onApply={handlePickTemplate}
                onStartBlank={handleStartBlank}
              />
            )}
            {tool === "sizes" && <PostPanelSizes format={editorFormat} onSelect={handleSelectFormat} />}
            {tool === "elements" && (
              <PostPanelElements
                nodeId={nodeId}
                onAddShape={(shape) => addElement({ kind: "shape", shape })}
                onAddIcon={(src) => addElement({ kind: "icon", src })}
                onAddImageUrl={(url) => addElement({ kind: "image", url })}
              />
            )}
            {tool === "text" && (
              <PostPanelText onAddText={(preset) => addElement({ kind: "text", preset })} />
            )}
            {tool === "connected" && (
              <PostPanelConnected
                nodes={connectedImageNodes}
                onAdd={(nodeId) => addElement({ kind: "connected", nodeId })}
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
            ref={stageAreaRef}
            // overflow-hidden, not auto: the artboard is scaled to fit this box, so a scrollbar
            // here would only ever mean the fit maths is wrong — better to see that than to
            // paper over it with a scroller nobody wants. min-w/h-0 lets this flex child
            // actually shrink, without which it would push past its parent and re-introduce
            // the overflow it is meant to prevent.
            className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/10"
            // Clicking the empty area AROUND the artboard clears the selection, the way it does
            // in any canvas tool — previously a selection survived until you happened to click
            // bare canvas, so the Transformer sat there over work you'd moved on from.
            // Guarded on the target being this padding itself: the panels and the inspector
            // both act ON the selection, so a click inside them must never drop it.
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) selectLayer(null);
            }}
            // Anything draggable in the left panels — a shape, an icon, a text preset, an
            // uploaded or connected photo — drops here, all through one payload type.
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(ELEMENT_DRAG_TYPE)) return;
              // preventDefault is what marks this a valid drop target; without it the browser
              // refuses the drop and animates the tile flying back to the panel.
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setIsDropTarget(true);
            }}
            onDragLeave={(e) => {
              // Guarded on relatedTarget: dragging across a child fires dragleave for the
              // parent too, which would flicker the highlight off on every internal boundary.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDropTarget(false);
            }}
            onDrop={(e) => {
              setIsDropTarget(false);
              const payload = parseElementDrag(e.dataTransfer.getData(ELEMENT_DRAG_TYPE));
              if (!payload) return;
              e.preventDefault();
              const stageBox = stageRef.current?.container().getBoundingClientRect();
              if (!stageBox) return;
              addElement(payload, {
                x: pxToNormalized(e.clientX - stageBox.left, stageBox.width),
                y: pxToNormalized(e.clientY - stageBox.top, stageBox.height),
              });
            }}
          >
            {/* The shift is a transform, not a margin, so it never enters the ResizeObserver's
                measurement and can't feed back into its own input.

                The drop highlight rings the ARTBOARD, not the whole area: ringing the area
                lit up a large empty rectangle that read as a glitch rather than as a target.
                You can still drop anywhere in here — a drop in the grey clamps onto the
                nearest edge — but the ring points at where the element will actually land. */}
            <div
              className={cn(
                "rounded-sm transition-[transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isDropTarget && "ring-2 ring-primary/60 ring-offset-4 ring-offset-background",
              )}
              style={{ transform: `translateX(${stageShift}px)` }}
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
                // Selecting on the canvas opens Layers, so the stack is visible with the
                // clicked row highlighted — you can see what you picked, where it sits in the
                // order, and rename or reorder it without hunting for the panel. Deselecting
                // deliberately leaves the panel alone: clearing a selection isn't a request to
                // change what you were looking at.
                onSelect={(id) => {
                  selectLayer(id);
                  if (id) setTool("layers");
                }}
                onToggleSelect={(id) => {
                  toggleLayerSelection(id);
                  setTool("layers");
                }}
                onSelectMany={(ids) => {
                  selectMany(ids);
                  if (ids.length) setTool("layers");
                }}
                resolveNodeImageUrl={resolveNodeImageUrl}
                updateLayerLive={updateLayerLive}
                commitLayerChange={commitLayerChange}
                stageRef={stageRef}
                onCommitText={(id, text) => { updateLayerLive(id, { text } as Partial<PostLayer>); commitLayerChange(); }}
                onImageLoaded={handleImageLoaded}
              />
            </PostLayerContextMenu>
            </div>
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
              containerW={containerW}
              containerH={containerH}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
