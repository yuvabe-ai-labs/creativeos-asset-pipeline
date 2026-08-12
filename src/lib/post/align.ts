import type { PostLayer } from "./types";
import { updateLayer } from "./layers";

export type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

export function boundingBoxOf(layers: PostLayer[]): { x: number; y: number; w: number; h: number } {
  const xs = layers.map((l) => l.x);
  const ys = layers.map((l) => l.y);
  const rights = layers.map((l) => l.x + l.w);
  const bottoms = layers.map((l) => l.y + l.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...rights) - x, h: Math.max(...bottoms) - y };
}

const CANVAS_BOX = { x: 0, y: 0, w: 1, h: 1 };

// Aligns every selected layer within a target box: the selection's own combined bounding box when
// 2+ layers are selected, or the canvas when exactly 1 is selected (post-editor-ux-v2-design.md §6).
export function alignLayers(layers: PostLayer[], selectedIds: string[], mode: AlignMode): PostLayer[] {
  if (selectedIds.length === 0) return layers;
  const selected = layers.filter((l) => selectedIds.includes(l.id));
  const target = selected.length >= 2 ? boundingBoxOf(selected) : CANVAS_BOX;

  return selected.reduce((acc, layer) => {
    let patch: Partial<PostLayer>;
    switch (mode) {
      case "left":
        patch = { x: target.x };
        break;
      case "center-h":
        patch = { x: target.x + (target.w - layer.w) / 2 };
        break;
      case "right":
        patch = { x: target.x + target.w - layer.w };
        break;
      case "top":
        patch = { y: target.y };
        break;
      case "center-v":
        patch = { y: target.y + (target.h - layer.h) / 2 };
        break;
      case "bottom":
        patch = { y: target.y + target.h - layer.h };
        break;
    }
    return updateLayer(acc, layer.id, patch);
  }, layers);
}

/**
 * Is a normalized point inside a normalized box? Edges count as inside.
 *
 * Used to decide whether a right-click belongs to an existing multi-selection. Hit-testing
 * the SHAPE under the cursor is not enough: the selection's bounding box contains gaps
 * between its layers, and can contain layers that were never selected. Right-clicking either
 * of those resolved to "not part of the selection" and collapsed it to whatever happened to
 * be underneath — the box is what the operator is aiming at, so the box is what we test.
 */
export function pointInBox(
  x: number,
  y: number,
  box: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}
