// src/components/nodes/post-group-layer.tsx
"use client";

import { Group } from "react-konva";
import type Konva from "konva";
import type { GroupLayer, PostLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
import { normalizedToPx } from "@/lib/post/units";
import { getGroupChildren } from "@/lib/post/layers";
import { PostLayerRender } from "./post-layer-render";

type Props = {
  layer: GroupLayer;
  containerW: number;
  containerH: number;
  // Full top-level layer list, needed to resolve childIds -> actual layer objects via
  // getGroupChildren (layers.ts) — see the module comment there: once a group exists, its
  // children are no longer findable in this array by id, their data lives on the group
  // itself (`layer.children`), so a plain `allLayers.find(...)` silently renders nothing.
  allLayers: PostLayer[];
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  nodeRef: (node: Konva.Node | null) => void;
  nodeProps: Konva.NodeConfig;
};

// Geometry: children store the SAME absolute (canvas-space, not group-relative) normalized
// x/y every layer kind already uses (types.ts's GroupLayer comment), and dragging/resizing
// only ever patches the GROUP's own x/y/w/h/rotation (post-stage.tsx's commitNodeGeometry is
// generic across every layer kind, including this one — it reads node.x()/node.y() straight
// off whatever Konva node this component hands back via `nodeRef` and writes that back as
// this layer's OWN x/y, exactly like every other layer). So the outer <Group> below must
// carry the SAME absolute px `{...geo}` every sibling renderer (post-shape-layer.tsx,
// post-text-layer.tsx, ...) passes to its Konva node, or the drag/Transformer round-trip
// through commitNodeGeometry would read back the wrong value.
//
// But Konva interprets a child's x/y INSIDE a positioned <Group x={gx} y={gy}> as relative
// to that group's origin, not the stage — so naively nesting children (who each compute
// their own ABSOLUTE px via their own layerToKonvaProps call, same as if they were rendered
// top-level) under an outer Group already translated by (gx, gy) double-applies that offset.
// Fix: wrap the children in an inner, non-refed, non-interactive Group that cancels the
// group's ORIGIN translation (see the detailed note in the body — cancelling the CURRENT
// translation instead makes the group's transform a no-op on its own children). The
// two translations net to zero when the outer's rotation is 0, and because Konva composes
// transforms down the node tree, a nonzero outer rotation still rotates the whole cancelled-
// and-recentered subtree around the outer Group's own (x, y) anchor point — the SAME pivot
// (top-left, no offsetX/offsetY) every other layer in this codebase already rotates around,
// so group rotation stays consistent with single-layer rotation rather than introducing a new
// convention.
export function PostGroupLayer({
  layer, containerW, containerH, allLayers, resolveNodeImageUrl, nodeRef, nodeProps,
}: Props) {
  const geo = layerToKonvaProps(layer, containerW, containerH);
  const children = getGroupChildren(allLayers, layer);

  // The inner group must cancel the group's ORIGIN box, not its CURRENT one.
  //
  // Children store creation-time absolute coordinates and are never rewritten while grouped
  // (see ungroupLayers). Cancelling by the current box (`-geo.x`) made the two translations
  // net to zero at every moment — including mid-drag — so the group's x/y had no rendered
  // effect on its children at all: a drag moved them while the pointer was down, then the
  // commit updated geo.x, the cancel followed it, and the children snapped straight back
  // while the layer recorded a move that never visibly happened. ungroupLayers would later
  // replay that phantom delta onto the children, teleporting them.
  //
  // Cancelling by the origin instead composes to gx + (cx - ox) * sx — exactly the
  // translate-and-scale ungroupLayers applies when the group is dissolved, so what is
  // rendered and what is persisted finally agree. For a freshly created group originBox
  // equals the current box and sx/sy are 1, which reduces to the previous behaviour.
  const origin = layer.originBox ?? { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
  const scaleX = origin.w === 0 ? 1 : layer.w / origin.w;
  const scaleY = origin.h === 0 ? 1 : layer.h / origin.h;
  const originX = normalizedToPx(origin.x, containerW);
  const originY = normalizedToPx(origin.y, containerH);

  return (
    <Group ref={nodeRef} {...geo} {...nodeProps}>
      <Group
        x={-originX * scaleX}
        y={-originY * scaleY}
        scaleX={scaleX}
        scaleY={scaleY}
      >
        {children.map((child) => (
          <PostLayerRender
            key={child.id}
            layer={child}
            containerW={containerW}
            containerH={containerH}
            allLayers={allLayers}
            isSelected={false}
            resolveNodeImageUrl={resolveNodeImageUrl}
            nodeRef={() => {}} // children inside a closed group aren't individually tracked/selectable
            onSelect={() => {}} // clicks still bubble up to the outer Group's onClick (from nodeProps), selecting the group
            onDragEnd={() => {}}
            onDblClickText={() => {}}
            onImageLoaded={() => {}} // grouped children's natural size isn't tracked individually (V2)
          />
        ))}
      </Group>
    </Group>
  );
}
