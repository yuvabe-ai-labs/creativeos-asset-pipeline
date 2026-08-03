import type {
  PostLayer,
  TextLayer,
  ShapeLayer,
  ImageLayer,
  IconLayer,
  ImageSource,
  IconSource,
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
