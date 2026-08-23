import type {
  PostLayer,
  TextLayer,
  ShapeLayer,
  ImageLayer,
  IconLayer,
  ImageSource,
  IconSource,
  GroupLayer,
  ShapeKind,
} from "./types";
import { boundingBoxOf } from "./align";

export const DEFAULT_GEOMETRY = {
  x: 0.1,
  y: 0.1,
  w: 0.3,
  h: 0.1,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
} as const;

/** How far each successive new layer steps down-right, in normalized units. */
const CASCADE_STEP = 0.02;
/** Steps before wrapping back to the origin, so a long session never walks off-canvas. */
const CASCADE_WRAP = 25;

/**
 * Where the next created layer should sit (D128). Without this every add landed on the
 * same coordinates, so three added texts formed a perfect stack in which only the top one
 * was selectable and nothing indicated the others existed.
 */
export function cascadeGeometry(existing: PostLayer[]): { x: number; y: number } {
  const step = (existing.length % CASCADE_WRAP) * CASCADE_STEP;
  return {
    x: DEFAULT_GEOMETRY.x + step,
    y: DEFAULT_GEOMETRY.y + step,
  };
}

export function createTextLayer(
  overrides: Partial<TextLayer> = {},
  existing: PostLayer[] = [],
): TextLayer {
  return clampToCanvas({
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
    ...cascadeGeometry(existing),
    ...overrides,
  });
}

/**
 * A rule and an arrow are DRAWN by their stroke — post-shape-layer.tsx paints no fill for
 * either. Seeding one here means the layer always carries the values that actually render it,
 * rather than leaning on that renderer's implicit `?? fill.color` / `?? h/6` fallbacks, which
 * the inspector cannot show a number for.
 */
const STROKE_ONLY_SHAPES = new Set<ShapeKind>(["line", "arrow"]);

export function createShapeLayer(
  overrides: Partial<ShapeLayer> = {},
  existing: PostLayer[] = [],
): ShapeLayer {
  const strokeSeed =
    overrides.shape && STROKE_ONLY_SHAPES.has(overrides.shape) && !overrides.stroke
      ? { stroke: { color: "#1e1e1e", width: 6 } }
      : {};
  return clampToCanvas({
    id: crypto.randomUUID(),
    kind: "shape",
    fill: { kind: "solid", color: "#5829c7" },
    radius: 0,
    ...DEFAULT_GEOMETRY,
    ...cascadeGeometry(existing),
    ...strokeSeed,
    ...overrides,
  });
}

export function createImageLayer(
  src: ImageSource,
  overrides: Partial<ImageLayer> = {},
  existing: PostLayer[] = [],
): ImageLayer {
  return clampToCanvas({
    id: crypto.randomUUID(),
    kind: "image",
    src,
    fit: "cover",
    ...DEFAULT_GEOMETRY,
    ...cascadeGeometry(existing),
    ...overrides,
  });
}

export function createIconLayer(
  src: IconSource,
  overrides: Partial<IconLayer> = {},
  existing: PostLayer[] = [],
): IconLayer {
  return clampToCanvas({
    id: crypto.randomUUID(),
    kind: "icon",
    src,
    color: "#1e1e1e",
    ...DEFAULT_GEOMETRY,
    w: 0.08,
    h: 0.08,
    ...cascadeGeometry(existing),
    ...overrides,
  });
}

/**
 * Look a layer up by id, reaching INSIDE groups — the same reach `updateLayer` has.
 *
 * The two disagreeing is a bug, not a distinction: every template's CTA label is a text layer
 * inside a shape+text group, and a top-level-only lookup returned nothing for it. The stage's
 * inline text editor used that lookup to decide what to edit, while the group separately
 * dimmed whichever child was being edited — so double-clicking a CTA pill made its label
 * vanish and gave you nothing to type into.
 */
/**
 * Pull a freshly-created layer back onto the canvas.
 *
 * The cascade steps x and y by 0.02 per existing layer so additions don't stack invisibly,
 * but it knows nothing about how big the new layer is — so a wide one eventually starts far
 * enough right to hang off the edge. A text preset 0.8 wide does it on the seventh add.
 *
 * Only ever pulls INWARD, and only along an axis that actually overflows, so a layer placed
 * deliberately at full bleed (x:0, w:1 — every template's background) is untouched. A layer
 * larger than the canvas pins to the origin rather than taking a negative coordinate.
 */
function clampToCanvas<T extends { x: number; y: number; w: number; h: number }>(geo: T): T {
  return {
    ...geo,
    x: Math.max(0, Math.min(geo.x, 1 - geo.w)),
    y: Math.max(0, Math.min(geo.y, 1 - geo.h)),
  };
}

export function findLayer(layers: PostLayer[], id: string): PostLayer | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.kind === "group" && layer.children) {
      const nested = findLayer(layer.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * Which TOP-LEVEL layer owns `id` — the layer itself if it sits in the top-level array, the
 * group that contains it (outermost, when groups nest) if it doesn't, null if it is nowhere.
 *
 * Every editor action addresses a top-level id: groupLayers/ungroupLayers/removeLayer/
 * reorderLayer all work on the top-level array, and the inspector resolves its layer with a
 * flat `layers.find`. A grouped child's id is NOT one of those — handing it to them silently
 * does nothing (YUV-303).
 *
 * That is exactly what a right-click on a group produced. Konva reports the child SHAPE under
 * the cursor as the event target, and post-stage.tsx's ref map also holds every grouped text
 * child (it has to — the inline editor measures those nodes), so walking up from the target hit
 * the label's own id before ever reaching the group's. The selection collapsed onto a layer that
 * does not exist at top level, which greyed out Ungroup, left the inspector empty, and made
 * every menu item a no-op. Resolving through here keeps a click ON a group meaning the GROUP.
 */
export function topLevelOwnerId(layers: PostLayer[], id: string): string | null {
  for (const layer of layers) {
    if (layer.id === id) return layer.id;
    if (layer.kind === "group" && findLayer(layer.children ?? [], id)) return layer.id;
  }
  return null;
}

// Arrays are ordered back -> front (index 0 renders first, underneath everything else),
// so appending puts the new layer on top — matching "Add" always landing visibly in front.
export function addLayer(layers: PostLayer[], layer: PostLayer): PostLayer[] {
  return [...layers, layer];
}

export function removeLayer(layers: PostLayer[], id: string): PostLayer[] {
  return layers.filter((l) => l.id !== id);
}

/**
 * Patch a layer by id, reaching INSIDE groups.
 *
 * Grouping moves a child's data onto the group (`children`), out of the top-level array — so a
 * flat `.map` silently no-ops for anything grouped. That made a grouped text layer's inline
 * edit vanish on commit, which every template's CTA label is. Recursing keeps one id-based
 * update working wherever the layer actually lives.
 */
export function updateLayer(
  layers: PostLayer[],
  id: string,
  patch: Partial<PostLayer>,
): PostLayer[] {
  return layers.map((l) => {
    if (l.id === id) return { ...l, ...patch } as PostLayer;
    if (l.kind === "group" && l.children?.some((c) => c.id === id)) {
      return { ...l, children: updateLayer(l.children, id, patch) } as PostLayer;
    }
    return l;
  });
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

// Drag-and-drop reorder: moves the layer to arbitrary `targetIndex` (clamped to the array's
// bounds), rather than one of reorderLayer's four fixed directions. `targetIndex` is measured
// in the SAME back-to-front index space as `layers` itself (index 0 = furthest back) — i.e.
// the raw array passed in, not the UI's reversed front-first display order; callers rendering
// front-first must convert. Splices the layer out first, then into `targetIndex` of the
// resulting (now one-shorter) array — same splice-after-removal approach as reorderLayer's
// forward/backward, so e.g. moving an earlier layer onto a later one's index lands it just
// AFTER that target (the target shifts left by one once the source is removed), while moving a
// later layer onto an earlier one's index lands it just BEFORE the target.
export function reorderLayerToIndex(
  layers: PostLayer[],
  id: string,
  targetIndex: number,
): PostLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return layers;
  const next = [...layers];
  const [layer] = next.splice(idx, 1);
  const clamped = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clamped, 0, layer);
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
