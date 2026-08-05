import type { LayerBase } from "./types";
import { pxToNormalized } from "./units";

export type Geometry = Pick<LayerBase, "x" | "y" | "w" | "h" | "rotation">;

// Arrow-key nudge — 1 CSS px normally, 10px with shift (post-node-design.md §5). The
// only direct-manipulation math this app hand-writes: drag/resize/rotate come from
// Konva's Transformer (Task 13B), which has no keyboard affordance of its own.
/**
 * Rotate a layer to `nextRotation` about its own CENTRE, returning the top-left that keeps the
 * centre where it was.
 *
 * Konva rotates a node about its position — which for every layer here is its top-left corner,
 * since none of them set an offset. Writing `rotation` on its own therefore swings the layer
 * around that corner and can fling it clean off the artboard: a wide, short layer like a rule
 * sweeps its whole length away and simply vanishes. Konva's own Transformer never shows this
 * because dragging its rotate anchor rewrites x/y alongside rotation; anything that sets
 * rotation directly — the inspector slider — has to do the same, which is what this is for.
 *
 * x/w are fractions of the container's WIDTH and y/h of its HEIGHT, and a rotation mixes the
 * two axes, so the arithmetic has to happen in px and convert back.
 */
export function rotateAboutCentre(
  geo: Geometry,
  nextRotation: number,
  containerW: number,
  containerH: number,
): Geometry {
  // A zero-sized container (before the stage has been measured) has no centre to preserve, and
  // dividing by it would write NaN into the layer's position.
  if (containerW <= 0 || containerH <= 0) return { ...geo, rotation: nextRotation };

  const halfW = (geo.w * containerW) / 2;
  const halfH = (geo.h * containerH) / 2;
  const corner = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Where the box's centre sits relative to its top-left, once rotated by `deg`.
    return { dx: halfW * cos - halfH * sin, dy: halfW * sin + halfH * cos };
  };

  const before = corner(geo.rotation ?? 0);
  const after = corner(nextRotation);
  const centreX = geo.x * containerW + before.dx;
  const centreY = geo.y * containerH + before.dy;

  return {
    ...geo,
    x: pxToNormalized(centreX - after.dx, containerW),
    y: pxToNormalized(centreY - after.dy, containerH),
    rotation: nextRotation,
  };
}

export function nudge(
  geo: Geometry,
  direction: "up" | "down" | "left" | "right",
  containerW: number,
  containerH: number,
  big = false,
): Geometry {
  const step = big ? 10 : 1;
  const dx = direction === "left" ? -step : direction === "right" ? step : 0;
  const dy = direction === "up" ? -step : direction === "down" ? step : 0;
  return {
    ...geo,
    x: geo.x + pxToNormalized(dx, containerW),
    y: geo.y + pxToNormalized(dy, containerH),
  };
}
