// The timeline's fixed scale (spec §6): it doesn't depend on the clips, so adding or trimming never
// rescales the rest, and long reels scroll. The window is the mockups' 20 s; no zoom this phase.
export const TIMELINE_WINDOW_SECONDS = 20;
const FALLBACK_PX_PER_SECOND = 16;
const MIN_BLOCK_PX = 6;

export function pxPerSecond(width: number): number {
  return width > 0 ? width / TIMELINE_WINDOW_SECONDS : FALLBACK_PX_PER_SECOND;
}

/** Where a block sits on any lane. Every lane and the playhead use the exact offset; only the
 *  width has a floor, so a tiny piece stays visible without shifting what follows. */
export function laneBox(offsetSeconds: number, seconds: number, scale: number): { left: number; width: number } {
  return { left: offsetSeconds * scale, width: Math.max(MIN_BLOCK_PX, seconds * scale) };
}
