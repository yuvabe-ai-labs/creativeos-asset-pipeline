// src/components/nodes/post-stage.tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer, Transformer, Rect } from "react-konva";
import type Konva from "konva";
import type { PostLayer } from "@/lib/post/types";
import { pxToNormalized, fontSizeToPx } from "@/lib/post/units";
import { resolveFontKey, type FontKey } from "@/lib/post/fonts";
import { Textarea } from "@/components/ui/textarea";
import { PostLayerRender } from "./post-layer-render";
import { FONT_CSS_FAMILY } from "./post-fonts";

type Props = {
  layers: PostLayer[];
  containerW: number;
  containerH: number;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  updateLayerLive: (id: string, patch: Partial<PostLayer>) => void;
  commitLayerChange: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onCommitText: (id: string, text: string) => void;
  // Forwarded straight through to PostLayerRender/PostImageLayer — this component holds
  // no state for it. The actual natural-size map is held by a later integration task in
  // post-focus-view.tsx.
  onImageLoaded: (layerId: string, naturalW: number, naturalH: number) => void;
};

export function PostStage({
  layers, containerW, containerH, selectedIds, onSelect, onToggleSelect, onSelectMany,
  resolveNodeImageUrl, updateLayerLive, commitLayerChange, stageRef, onCommitText, onImageLoaded,
}: Props) {
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stageContainer, setStageContainer] = useState<HTMLDivElement | null>(null);
  const [editingRect, setEditingRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Rubber-band drag-select rectangle, in stage px, while a drag is in progress; null otherwise.
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Attach the Transformer to every currently-selected node whenever selection changes.
  // useLayoutEffect, not useEffect, because export depends on it: use-post-export's
  // flushSync(() => onDeselect()) only guarantees render + LAYOUT effects have run before
  // it returns, so as a passive effect the selection handles could still be attached when
  // stage.toBlob() captures pixels — and get baked into the PNG. Everything here is
  // synchronous Konva work, so running it earlier is safe.
  useLayoutEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => n !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, layers]);

  // Refs must not be read during render (react-hooks/refs) — resolve the editing node's
  // client rect here instead, and have the overlay below read the resulting state.
  useLayoutEffect(() => {
    const node = editingTextId ? nodeRefs.current.get(editingTextId) : undefined;
    const rect = node ? node.getClientRect({ relativeTo: node.getStage() ?? undefined }) : null;
    setEditingRect(rect);
  }, [editingTextId]);

  function commitNodeGeometry(id: string, node: Konva.Node) {
    // Konva's Transformer RESIZES BY SCALING, never by changing width/height directly —
    // read scaleX/scaleY back into width/height, then reset scale to 1, or the layer's
    // stored geometry silently drifts from what's actually rendered (Global Constraints).
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const widthPx = "width" in node.attrs ? node.width() * scaleX : node.width();
    const heightPx = "height" in node.attrs ? node.height() * scaleY : node.height();
    node.scaleX(1);
    node.scaleY(1);
    updateLayerLive(id, {
      x: pxToNormalized(node.x(), containerW),
      y: pxToNormalized(node.y(), containerH),
      w: pxToNormalized(widthPx, containerW),
      h: pxToNormalized(heightPx, containerH),
      rotation: node.rotation(),
    });
    commitLayerChange();
  }

  // Rubber-band select: mousedown on empty stage space starts tracking a drag rect and
  // clears the current selection (a plain click, with no drag, is just a mousedown+mouseup
  // pair where the rect never grows past the `> 4`px guard below, so it correctly ends up
  // doing nothing more than the deselect already fired here).
  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    // Only defer to Konva's own move-drag when the clicked node is the currently-selected,
    // actually-draggable shape. An unselected shape (including a full-bleed background image)
    // has draggable=false (post-layer-render.tsx), so a drag gesture starting on it does
    // nothing in Konva itself — safe to treat as the start of a rubber-band instead.
    if (e.target !== stage && e.target.draggable()) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    dragStartRef.current = pos;
    setSelectionRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    onSelect(null);
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!dragStartRef.current) return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const start = dragStartRef.current;
    setSelectionRect({
      x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x), h: Math.abs(pos.y - start.y),
    });
  }

  function handleStageMouseUp() {
    if (!dragStartRef.current || !selectionRect) {
      dragStartRef.current = null;
      setSelectionRect(null);
      return;
    }
    if (selectionRect.w > 4 || selectionRect.h > 4) { // ignore accidental tiny drags (= a click)
      const hitIds = layers
        .filter((l) => !l.hidden && !l.locked)
        .filter((l) => {
          const lx = l.x * containerW, ly = l.y * containerH, lw = l.w * containerW, lh = l.h * containerH;
          return (
            lx < selectionRect.x + selectionRect.w && lx + lw > selectionRect.x &&
            ly < selectionRect.y + selectionRect.h && ly + lh > selectionRect.y
          );
        })
        .map((l) => l.id);
      if (hitIds.length) onSelectMany(hitIds);
    }
    dragStartRef.current = null;
    setSelectionRect(null);
  }

  return (
    <div className="relative">
      <Stage
        ref={(node) => {
          stageRef.current = node;
          if (node) setStageContainer(node.container());
        }}
        width={containerW}
        height={containerH}
        className="overflow-hidden rounded-lg border border-border bg-white shadow-card"
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          {layers.filter((l) => !l.hidden).map((layer) => (
            <PostLayerRender
              key={layer.id}
              layer={layer}
              containerW={containerW}
              containerH={containerH}
              allLayers={layers}
              isSelected={selectedIds.includes(layer.id)}
              resolveNodeImageUrl={resolveNodeImageUrl}
              nodeRef={(node) => {
                if (node) nodeRefs.current.set(layer.id, node);
                else nodeRefs.current.delete(layer.id);
              }}
              onSelect={(evt) => {
                if (layer.locked) return;
                if (evt?.evt.shiftKey) onToggleSelect(layer.id);
                else onSelect(layer.id);
              }}
              onDragEnd={(node) => commitNodeGeometry(layer.id, node)}
              onDblClickText={() => layer.kind === "text" && !layer.locked && setEditingTextId(layer.id)}
              onImageLoaded={onImageLoaded}
            />
          ))}
          {selectionRect && (
            <Rect
              x={selectionRect.x} y={selectionRect.y} width={selectionRect.w} height={selectionRect.h}
              fill="rgba(88,41,199,0.08)" stroke="#5829c7" strokeWidth={1} dash={[4, 4]} listening={false}
            />
          )}
          <Transformer
            ref={transformerRef}
            anchorStroke="#5829c7"
            anchorFill="#ffffff"
            anchorSize={10}
            anchorCornerRadius={5}
            borderStroke="#5829c7"
            borderStrokeWidth={2}
            rotateAnchorOffset={24}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 20 || newBox.height < 20 ? oldBox : newBox
            }
            onTransformEnd={(e) => {
              const node = e.target;
              const id = [...nodeRefs.current.entries()].find(([, n]) => n === node)?.[0];
              if (id) commitNodeGeometry(id, node);
            }}
          />
        </Layer>
      </Stage>
      {/* The inline text-edit overlay is an HTML textarea, not a Konva node — Konva
          can't host an editable input, so it's rendered as a sibling positioned over
          the Stage via the container's client rect. */}
      {editingTextId && stageContainer && editingRect && (() => {
        const rect = editingRect;
        const layer = layers.find((l) => l.id === editingTextId);
        if (layer?.kind !== "text") return null;
        // Mirror the SAME font resolution post-text-layer.tsx uses for the resting Konva
        // Text node (Tamil-companion fallback included) so the overlay's face matches the
        // text it's covering, not just a generic system font.
        const fontKey = resolveFontKey(layer.fontFamily as FontKey, layer.text);
        return (
          <Textarea
            autoFocus
            defaultValue={layer.text}
            style={{
              position: "absolute",
              left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              // Same conversion textLayerFontProps (layer-konva-props.ts) uses for the
              // resting Konva Text node, so the overlay's type doesn't visibly jump in
              // size relative to the text it's replacing.
              fontSize: fontSizeToPx(layer.fontSize, containerH),
              lineHeight: layer.lineHeight,
              fontFamily: FONT_CSS_FAMILY[fontKey],
              fontWeight: layer.fontWeight,
              color: layer.color,
              textAlign: layer.align,
              letterSpacing: layer.letterSpacing ? `${layer.letterSpacing}px` : undefined,
              opacity: layer.opacity ?? 1,
              resize: "none",
              // Cancels the shadcn Textarea's default `field-sizing-content` (auto-grows
              // to fit typed content, overriding even an explicit height) — this overlay's
              // box must stay exactly at the click-to-edit hit-rect computed above.
              fieldSizing: "fixed",
            }}
            className="nodrag absolute z-10 min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
            onBlur={(e) => { onCommitText(editingTextId, e.target.value); setEditingTextId(null); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditingTextId(null); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                onCommitText(editingTextId, (e.target as HTMLTextAreaElement).value);
                setEditingTextId(null);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
