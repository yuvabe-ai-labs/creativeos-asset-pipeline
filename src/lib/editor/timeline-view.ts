// The timeline's view maths (D403, D404): zoom, fit, follow the playhead, snapping and where a
// dragged clip lands. Pure; zoom is pixels per second.
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 220;
export const DEFAULT_ZOOM = 60;
const FOLLOW_MARGIN_PX = 60;
const SNAP_PX = 8;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The zoom that shows the whole reel in `viewPx`, leaving `padPx` at the end. */
export function fitZoom(viewPx: number, totalSeconds: number, padPx = 40): number {
  if (totalSeconds <= 0 || viewPx <= padPx) return DEFAULT_ZOOM;
  return clampZoom((viewPx - padPx) / totalSeconds);
}

/** The scroll that keeps `time` at the same screen x when the zoom changes. */
export function zoomAround(oldZoom: number, newZoom: number, time: number, scrollLeft: number): number {
  const onScreen = time * oldZoom - scrollLeft;
  return Math.max(0, time * newZoom - onScreen);
}

/** While playing: the scroll that brings the playhead back into view, or null when it's visible. */
export function followScroll(time: number, zoom: number, scrollLeft: number, viewPx: number): number | null {
  const x = time * zoom;
  if (x >= scrollLeft && x <= scrollLeft + viewPx - 20) return null;
  return Math.max(0, x - FOLLOW_MARGIN_PX);
}

/** The nearest target within 8 px of `seconds` at this zoom, or null. */
export function snapTarget(seconds: number, targets: number[], zoom: number, px = SNAP_PX): number | null {
  let best: number | null = null;
  for (const t of targets) {
    const d = Math.abs(t - seconds) * zoom;
    if (d <= px && (best === null || d < Math.abs(best - seconds) * zoom)) best = t;
  }
  return best;
}

/** Where a clip dragged to `pointerSeconds` lands: before the first piece whose middle is right of it. */
export function reorderIndex(pointerSeconds: number, pieces: Array<{ in: number; out: number }>): number {
  let offset = 0;
  for (let i = 0; i < pieces.length; i++) {
    const len = pieces[i].out - pieces[i].in;
    if (pointerSeconds < offset + len / 2) return i;
    offset += len;
  }
  return pieces.length;
}

/** Ruler ticks: a minor tick every `minor` seconds, a label every `major`. */
export function rulerStep(zoom: number): { minor: number; major: number } {
  if (zoom >= 120) return { minor: 0.5, major: 1 };
  if (zoom >= 40) return { minor: 1, major: 2 };
  if (zoom >= 20) return { minor: 2, major: 5 };
  return { minor: 5, major: 10 };
}
