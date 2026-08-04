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

export function duplicateLayer(layers: PostLayer[], id: string): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return layers;
  const source = layers[idx];
  const copy: PostLayer = {
    ...source,
    id: crypto.randomUUID(),
    x: source.x + 0.02,
    y: source.y + 0.02,
  };
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

function boundingBoxOf(layers: PostLayer[]): { x: number; y: number; w: number; h: number } {
  const xs = layers.map((l) => l.x);
  const ys = layers.map((l) => l.y);
  const rights = layers.map((l) => l.x + l.w);
  const bottoms = layers.map((l) => l.y + l.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...rights) - x, h: Math.max(...bottoms) - y };
}

// GroupLayer (Task 2) only carries `childIds: string[]` — no nested storage for the children's
// own data. Since groupLayers removes children from the top-level array, ungroupLayers cannot
// recover their full state (name, kind, text, style...) from `childIds` alone. We stash a
// snapshot of the removed children as a non-public field on the group object (not part of the
// public GroupLayer type, so nothing outside this file needs to know about it) purely so
// ungroupLayers has a fallback. This keeps both functions pure (no module-level state) and
// requires no change to the shipped GroupLayer type.
type GroupLayerWithSnapshot = GroupLayer & { __childSnapshot?: PostLayer[] };

export function groupLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  const targets = layers.filter((l) => ids.includes(l.id));
  if (targets.length < 2) return layers;
  const box = boundingBoxOf(targets);
  const group: GroupLayerWithSnapshot = {
    id: crypto.randomUUID(),
    kind: "group",
    childIds: targets.map((l) => l.id),
    ...box,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    __childSnapshot: targets,
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
  // wins. Fall back to the snapshot taken at group-creation time, since groupLayers (this file)
  // removes children from the top-level array, so that's normally the only place to find them.
  const snapshot = (group as GroupLayerWithSnapshot).__childSnapshot ?? [];
  const snapshotById = new Map(snapshot.map((l) => [l.id, l] as const));
  const children = group.childIds
    .map((id) => layers.find((l) => l.id === id) ?? snapshotById.get(id))
    .filter((l): l is PostLayer => l !== undefined);
  return [...layers.slice(0, idx), ...children, ...layers.slice(idx + 1)];
}

export function copyLayers(layers: PostLayer[], ids: string[]): PostLayer[] {
  return layers
    .filter((l) => ids.includes(l.id))
    .map((l) => ({ ...l, id: crypto.randomUUID() }) as PostLayer);
}

export function pasteLayers(layers: PostLayer[], clipboard: PostLayer[]): PostLayer[] {
  const pasted = clipboard.map(
    (l) => ({ ...l, id: crypto.randomUUID(), x: l.x + 0.02, y: l.y + 0.02 }) as PostLayer,
  );
  return [...layers, ...pasted];
}
