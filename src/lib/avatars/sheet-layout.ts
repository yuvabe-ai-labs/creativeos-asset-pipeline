// D395 — where to cut the one turnaround sheet into its four views. Pure, so it is tested
// without sharp: the caller turns the image into a texture profile (how much fine detail each
// column has) and cuts where this says.
//
// Texture, not colour: a model's backdrop is often a gradient, lighter in the middle, so a gap
// between two figures can differ from the edge colour as much as a figure does (Radha's sheet,
// 22 Oct 2026, merged two views that way). A backdrop is smooth whatever its shade; people,
// fabric and hair are not.

const VIEWS = 4;
/** Each cut is looked for within this share of the width either side of where the prompt asks
 *  the figures to part (the quarter lines), so the windows tile the sheet without overlapping. */
const WINDOW = 1 / (2 * VIEWS);
/** A column counts as gap when its detail is within this share of the window's range above the
 *  window's smoothest column. */
const GAP_LEVEL = 0.2;

/** Four [start, end) column ranges, left to right, covering the whole width. Each cut is the
 *  middle of the widest smooth stretch near its quarter line; with no stretch smoother than the
 *  rest, that is the quarter line itself. */
export function gapCuts(texture: readonly number[]): [number, number][] {
  const width = texture.length;
  const edges = [0];
  for (let i = 1; i < VIEWS; i++) {
    const a = Math.floor(width * (i / VIEWS - WINDOW));
    const b = Math.floor(width * (i / VIEWS + WINDOW));
    const window = texture.slice(a, b);
    const low = Math.min(...window);
    const level = low + (Math.max(...window) - low) * GAP_LEVEL;
    let best: [number, number] = [a, a];
    let run: [number, number] | null = null;
    for (let x = a; x <= b; x++) {
      if (x < b && texture[x] <= level) run = run ? [run[0], x + 1] : [x, x + 1];
      else if (run) {
        if (run[1] - run[0] > best[1] - best[0]) best = run;
        run = null;
      }
    }
    edges.push(Math.round((best[0] + best[1]) / 2));
  }
  edges.push(width);
  return edges.slice(0, -1).map((start, i) => [start, edges[i + 1]]);
}

/** The 3:4 canvas a cut is centred on (the shape every view has had since D340), padding with
 *  backdrop rather than stretching or cropping the figure. */
export function viewCanvas(width: number, height: number): { width: number; height: number; left: number; top: number } {
  if (width / height < 3 / 4) {
    const w = Math.round((height * 3) / 4);
    return { width: w, height, left: Math.round((w - width) / 2), top: 0 };
  }
  const h = Math.round((width * 4) / 3);
  return { width, height: h, left: 0, top: Math.round((h - height) / 2) };
}
