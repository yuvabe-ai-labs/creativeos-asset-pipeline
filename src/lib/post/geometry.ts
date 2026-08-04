import type { LayerBase } from "./types";
import { pxToNormalized } from "./units";

export type Geometry = Pick<LayerBase, "x" | "y" | "w" | "h" | "rotation">;

// Arrow-key nudge — 1 CSS px normally, 10px with shift (post-node-design.md §5). The
// only direct-manipulation math this app hand-writes: drag/resize/rotate come from
// Konva's Transformer (Task 13B), which has no keyboard affordance of its own.
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
