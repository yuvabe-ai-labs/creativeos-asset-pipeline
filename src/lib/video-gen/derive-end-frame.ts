/** Horizontal offset left of the video node, so the derived node does not cover it. */
const OFFSET_X = 360;
/** Vertical offset below the video node. */
const OFFSET_Y = 240;

/**
 * Where a derived end-frame image node is placed relative to its video node. Clamped at the
 * origin so a video node near the canvas corner does not push its derived node off-canvas.
 */
export function endFrameNodePosition(videoNodePosition: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.max(0, videoNodePosition.x - OFFSET_X),
    y: Math.max(0, videoNodePosition.y + OFFSET_Y),
  };
}
