// src/components/nodes/post-group-layer.tsx
"use client";

import { Group } from "react-konva";
import type Konva from "konva";
import type { GroupLayer, PostLayer } from "@/lib/post/types";
import { layerToKonvaProps } from "@/lib/post/layer-konva-props";
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
// Fix: wrap the children in an inner, non-refed, non-interactive <Group x={-gx} y={-gy}> that
// cancels the outer translation before the children's own absolute coordinates take over. The
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

  return (
    <Group ref={nodeRef} {...geo} {...nodeProps}>
      <Group x={-geo.x} y={-geo.y}>
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
          />
        ))}
      </Group>
    </Group>
  );
}
