// src/components/nodes/post-focus-view.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Layers as LayersIcon, Palette } from "lucide-react";
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
  const formatSpec = POST_FORMATS[format ?? "ig-square"];
  const scale = Math.min(1, STAGE_MAX_PX / Math.max(formatSpec.width, formatSpec.height));
  const containerW = formatSpec.width * scale;
  const containerH = formatSpec.height * scale;

  const { layers, selectedId, selectLayer, addText, addShape, addImage, addIcon, updateLayerLive,
    commitLayerChange, replaceAllLayers, deleteLayer, duplicateLayer, reorder, toggleLock,
    toggleHidden, undo, redo, canUndo, canRedo,
  } = usePostEditor(persistedLayers ?? [], (next) => onPatch({ layers: next }));

  const [rail, setRail] = useState<"layers" | "brand">("layers");
  // Captured ONCE, lazily, from the TRUE initial scene — never re-derived from
  // `layers.length`, so the auto-place effect adding the first layer can't close the
  // picker out from under the operator, and "Start blank" has something real to turn off.
  const [pickerOpen, setPickerOpen] = useState(() => (persistedLayers ?? []).length === 0);
  const stageRef = useRef<Konva.Stage>(null);

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
    // Layers go through the editor's own history (which owns them); templateId is not
    // part of that state, so it stays a plain patch.
    replaceAllLayers(seeded);
    onPatch({ templateId: template.id });
    setPickerOpen(false);
  }

  const showTemplatePicker = pickerOpen;
  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;

  // Keyboard shortcuts — guarded against typing in a field (isEditableTarget), same
  // pattern the canvas itself already uses for its own shortcuts.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target as HTMLElement)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) { e.preventDefault(); deleteLayer(selectedId); }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (selectedId) { e.preventDefault(); duplicateLayer(selectedId); }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === "]" && selectedId) {
        reorder(selectedId, e.shiftKey ? "front" : "forward");
      } else if (e.key === "[" && selectedId) {
        reorder(selectedId, e.shiftKey ? "back" : "backward");
      } else if (ARROW_DIRECTIONS[e.key] && selectedId && selectedLayer) {
        // Arrow keys nudge 1px, shift-arrow 10px (§5). preventDefault stops the sheet
        // scrolling underneath. A nudge is discrete, like a click — commit it as its own
        // undo step immediately rather than coalescing a run of presses.
        const direction = ARROW_DIRECTIONS[e.key]!;
        e.preventDefault();
        if (selectedLayer.locked) return;
        updateLayerLive(selectedId, nudge(selectedLayer, direction, containerW, containerH, e.shiftKey));
        commitLayerChange();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedId, selectedLayer, containerW, containerH, updateLayerLive,
      commitLayerChange, deleteLayer, duplicateLayer, undo, redo, reorder]);

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
          <div className="w-56 shrink-0 overflow-y-auto border-r border-border p-3">
            {rail === "layers" ? (
              <PostLayerList
                layers={layers}
                selectedId={selectedId}
                onSelect={selectLayer}
                onReorder={reorder}
                onToggleLock={toggleLock}
                onToggleHidden={toggleHidden}
                onDuplicate={duplicateLayer}
                onDelete={deleteLayer}
              />
            ) : (
              <PostBrandTabStub />
            )}
          </div>

          {/* Stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/10 p-6">
            <PostStage
              layers={layers}
              containerW={containerW}
              containerH={containerH}
              selectedId={selectedId}
              onSelect={selectLayer}
              resolveNodeImageUrl={resolveNodeImageUrl}
              updateLayerLive={updateLayerLive}
              commitLayerChange={commitLayerChange}
              stageRef={stageRef}
              onCommitText={(id, text) => { updateLayerLive(id, { text } as Partial<PostLayer>); commitLayerChange(); }}
            />
            <PostTemplatePicker
              open={showTemplatePicker}
              onPick={handlePickTemplate}
              onStartBlank={() => setPickerOpen(false)}
            />
          </div>

          {/* Inspector */}
          <div className="w-56 shrink-0 overflow-y-auto border-l border-border p-3">
            <PostInspector
              layer={selectedLayer}
              onChange={(patch) => { if (selectedId) { updateLayerLive(selectedId, patch); commitLayerChange(); } }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
