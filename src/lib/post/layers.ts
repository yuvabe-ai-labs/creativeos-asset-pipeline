import type {
  PostLayer,
  TextLayer,
  ShapeLayer,
  ImageLayer,
  IconLayer,
  ImageSource,
  IconSource,
  GroupLayer,
} from "./types";
import { boundingBoxOf } from "./align";

const DEFAULT_GEOMETRY = {
  x: 0.1,
  y: 0.1,
  w: 0.3,
  h: 0.1,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
} as const;

export function createTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: crypto.randomUUID(),
    kind: "text",
    text: "Text",
    fontFamily: "inter",
    fontSize: 0.05,
    fontWeight: 600,
    color: "#1e1e1e",
    align: "left",
    lineHeight: 1.2,
    ...DEFAULT_GEOMETRY,
    ...overrides,
  };
}

export function createShapeLayer(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: crypto.randomUUID(),
    kind: "shape",
    fill: { kind: "solid", color: "#5829c7" },
    radius: 0,
    ...DEFAULT_GEOMETRY,
    ...overrides,
  };
}

export function createImageLayer(
  src: ImageSource,
  overrides: Partial<ImageLayer> = {},
): ImageLayer {
  return {
    id: crypto.randomUUID(),
    kind: "image",
    src,
    fit: "cover",
    ...DEFAULT_GEOMETRY,
    ...overrides,
  };
}

export function createIconLayer(
  src: IconSource,
  overrides: Partial<IconLayer> = {},
): IconLayer {
  return {
    id: crypto.randomUUID(),
    kind: "icon",
    src,
    color: "#1e1e1e",
    ...DEFAULT_GEOMETRY,
    w: 0.08,
    h: 0.08,
    ...overrides,
  };
}

export function findLayer(layers: PostLayer[], id: string): PostLayer | undefined {
  return layers.find((l) => l.id === id);
}

// Arrays are ordered back -> front (index 0 renders first, underneath everything else),
// so appending puts the new layer on top — matching "Add" always landing visibly in front.
export function addLayer(layers: PostLayer[], layer: PostLayer): PostLayer[] {
  return [...layers, layer];
}

export function removeLayer(layers: PostLayer[], id: string): PostLayer[] {
  return layers.filter((l) => l.id !== id);
}

export function updateLayer(
  layers: PostLayer[],
  id: string,
  patch: Partial<PostLayer>,
): PostLayer[] {
  return layers.map((l) => (l.id === id ? ({ ...l, ...patch } as PostLayer) : l));
}

// Gives a layer a fresh top-level id. For a GroupLayer, ALSO gives every one of its `children` a
// fresh id and keeps `childIds`/`children` in sync with those new ids — otherwise the copy's
// children still carry the SAME ids as the original's children, and every id-keyed lookup in this
// module (findLayer, updateLayer, removeLayer, and React `key`s downstream) would treat the two
// as one once both exist side by side (e.g. copy -> paste -> ungroup both). Non-group layers are
// unaffected beyond their own id, same as before.
function refreshIds(layer: PostLayer): PostLayer {
  const fresh = { ...layer, id: crypto.randomUUID() } as PostLayer;
  if (fresh.kind !== "group") return fresh;
  // Recurse rather than a flat id swap: a child can itself be a GroupLayer (groupLayers has no
  // guard against grouping a selection that includes an existing group), and refreshIds already
  // returns a group with consistent childIds/children when called on one — so mapping this same
  // function over the children keeps every nesting depth's ids in sync, not just the first level.
  const newChildren = (fresh.children ?? []).map(refreshIds);
  return { ...fresh, childIds: newChildren.map((child) => child.id), children: newChildren };
}

export function duplicateLayer(layers: PostLayer[], id: string): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return layers;
  const source = layers[idx];
  const copy = refreshIds({
    ...source,
    x: source.x + 0.02,
    y: source.y + 0.02,
  });
  return [...layers.slice(0, idx + 1), copy, ...layers.slice(idx + 1)];
}

export type ReorderDirection = "front" | "forward" | "backward" | "back";

export function reorderLayer(
  layers: PostLayer[],
  id: string,
  direction: ReorderDirection,
): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return layers;
  const next = [...layers];
  const [layer] = next.splice(idx, 1);
  if (direction === "front") {
    next.push(layer);
  } else if (direction === "back") {
    next.unshift(layer);
  } else if (direction === "forward") {
    next.splice(Math.min(idx + 1, next.length), 0, layer);
  } else {
    next.splice(Math.max(idx - 1, 0), 0, layer);
  }
  return next;
}

export function toggleLock(layers: PostLayer[], id: string): PostLayer[] {
  const layer = findLayer(layers, id);
  return updateLayer(layers, id, { locked: !layer?.locked });
}

export function toggleHidden(layers: PostLayer[], id: string): PostLayer[] {
  const layer = findLayer(layers, id);
  return updateLayer(layers, id, { hidden: !layer?.hidden });
}

// The "prefer a live top-level-array entry, fall back to the group's own stored `children`"
// lookup used by ungroupLayers. Exported because a later rendering task (Konva Group rendering of
// a GroupLayer) needs this exact same data from a different file.
export function getGroupChildren(layers: PostLayer[], group: GroupLayer): PostLayer[] {
  const snapshotById = new Map((group.children ?? []).map((l) => [l.id, l] as const));
  return group.childIds
    .map((id) => layers.find((l) => l.id === id) ?? snapshotById.get(id))
    .filter((l): l is PostLayer => l !== undefined);
}

export function groupLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  const targets = layers.filter((l) => ids.includes(l.id));
  if (targets.length < 2) return layers;
  const box = boundingBoxOf(targets);
  const group: GroupLayer = {
    id: crypto.randomUUID(),
    kind: "group",
    childIds: targets.map((l) => l.id),
    children: targets,
    ...box,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    originBox: { ...box, rotation: 0 },
  };
  const targetIdSet = new Set(targets.map((l) => l.id));
  const withoutTargets = layers.filter((l) => !targetIdSet.has(l.id));
  // Insert at the frontmost (highest-index) grouped layer's original position, remapped into
  // the shorter `withoutTargets` index space: count how many KEPT (non-grouped) layers sat at
  // or before that original index, and insert right after them. This preserves the group's
  // stacking order relative to every layer that wasn't part of the group — e.g. a layer that
  // was originally in front of the whole group stays in front of the group afterwards, and one
  // that was behind stays behind — rather than just clamping the raw index into the new array.
  const frontmostIdx = Math.max(...layers.map((l, i) => (targetIdSet.has(l.id) ? i : -1)));
  const keptBeforeOrAtFrontmost = layers
    .slice(0, frontmostIdx + 1)
    .filter((l) => !targetIdSet.has(l.id)).length;
  const insertAt = keptBeforeOrAtFrontmost;
  return [...withoutTargets.slice(0, insertAt), group, ...withoutTargets.slice(insertAt)];
}

export function ungroupLayers(layers: PostLayer[], groupId: string): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === groupId);
  if (idx === -1) return layers;
  const group = layers[idx];
  if (group.kind !== "group") return layers;
  // Prefer looking children up BY ID in the current `layers` array — if some future flow keeps
  // a grouped child independently addressable there, its live state (post updateLayer calls)
  // wins. Fall back to `children`, the snapshot taken at group-creation time, since groupLayers
  // (this file) removes children from the top-level array, so that's normally the only place to
  // find them.
  const rawChildren = getGroupChildren(layers, group);
  // The group may have been moved/resized/rotated via updateLayer since it was created — its
  // x/y/w/h/rotation transform is meant to apply on top of the children's stored (creation-time)
  // positions at render time (see the design comment on GroupLayer in types.ts), so the children
  // themselves are never rewritten while grouped. Reinserting them verbatim would snap them back
  // to where they were BEFORE the move/resize/rotate. Instead, diff the group's current box
  // against its creation-time originBox and carry the children along by that same transform:
  // translate by the position delta, scale each child's offset-from-origin (and its own w/h) by
  // how much the group's box has grown/shrunk, and additively apply the rotation delta to each
  // child's own `rotation` (a deliberately simpler approximation — it does NOT rotate each
  // child's position around the group's center; true pivot rotation is out of scope here).
  const originBox = group.originBox ?? { x: group.x, y: group.y, w: group.w, h: group.h, rotation: group.rotation ?? 0 };
  const scaleX = originBox.w === 0 ? 1 : group.w / originBox.w;
  const scaleY = originBox.h === 0 ? 1 : group.h / originBox.h;
  const dRotation = (group.rotation ?? 0) - originBox.rotation;
  const children = rawChildren.map((l) => {
    const childOffsetX = l.x - originBox.x;
    const childOffsetY = l.y - originBox.y;
    return {
      ...l,
      x: group.x + childOffsetX * scaleX,
      y: group.y + childOffsetY * scaleY,
      w: l.w * scaleX,
      h: l.h * scaleY,
      rotation: (l.rotation ?? 0) + dRotation,
    } as PostLayer;
  });
  return [...layers.slice(0, idx), ...children, ...layers.slice(idx + 1)];
}

export function copyLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  return layers.filter((l) => ids.includes(l.id)).map((l) => refreshIds(l));
}

export function pasteLayers(layers: PostLayer[], clipboard: PostLayer[]): PostLayer[] {
  const pasted = clipboard.map((l) => refreshIds({ ...l, x: l.x + 0.02, y: l.y + 0.02 }));
  return [...layers, ...pasted];
}
