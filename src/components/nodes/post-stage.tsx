// src/components/nodes/post-stage.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Transformer } from "react-konva";
import type Konva from "konva";
import type { PostLayer } from "@/lib/post/types";
import { pxToNormalized } from "@/lib/post/units";
import { PostLayerRender } from "./post-layer-render";

type Props = {
  layers: PostLayer[];
  containerW: number;
  containerH: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  updateLayerLive: (id: string, patch: Partial<PostLayer>) => void;
  commitLayerChange: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
};

export function PostStage({
  layers, containerW, containerH, selectedId, onSelect, resolveNodeImageUrl,
  updateLayerLive, commitLayerChange, stageRef,
}: Props) {
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Attach the Transformer to the currently-selected node whenever selection changes.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? nodeRefs.current.get(selectedId) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, layers]);

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

  return (
    <Stage
      ref={stageRef}
      width={containerW}
      height={containerH}
      className="overflow-hidden rounded-lg border border-border bg-white shadow-card"
      onClick={(e) => { if (e.target === e.target.getStage()) onSelect(null); }}
    >
      <Layer>
        {layers.filter((l) => !l.hidden).map((layer) => (
          <PostLayerRender
            key={layer.id}
            layer={layer}
            containerW={containerW}
            containerH={containerH}
            isSelected={selectedId === layer.id}
            resolveNodeImageUrl={resolveNodeImageUrl}
            nodeRef={(node) => {
              if (node) nodeRefs.current.set(layer.id, node);
              else nodeRefs.current.delete(layer.id);
            }}
            onSelect={() => !layer.locked && onSelect(layer.id)}
            onDragEnd={(node) => commitNodeGeometry(layer.id, node)}
            onDblClickText={() => layer.kind === "text" && !layer.locked && setEditingTextId(layer.id)}
          />
        ))}
        <Transformer
          ref={transformerRef}
          anchorStroke="#5829c7"
          anchorFill="#ffffff"
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#5829c7"
          borderStrokeWidth={2}
          rotateAnchorOffset={24}
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
      {/* The inline text-edit overlay is an HTML textarea, not a Konva node — Konva
          can't host an editable input. It lives in post-focus-view.tsx (Task 20), which
          reads `editingTextId` via a prop this component exposes through onSelect's
          sibling callback — wired in Task 20's assembly. */}
    </Stage>
  );
}
