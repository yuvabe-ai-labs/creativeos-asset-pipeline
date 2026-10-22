// D395 — where to cut the one turnaround sheet into its four views. Pure, so it is tested
// without sharp: the caller turns the image into a column profile (how much of each column is
// figure rather than backdrop) and cuts where this says.

const FIGURES = 4;
/** A column counts as figure when more than this share of it differs from the backdrop. */
const FIGURE_COLUMN = 0.02;
/** Gaps narrower than this share of the width are inside one figure (between the legs, an arm). */
const MERGE_GAP = 0.01;
/** Runs narrower than this share of the width are specks, not a person. */
const MIN_FIGURE = 0.02;

/** Four [start, end) column ranges, left to right, covering the whole width. Each cut sits in the
 *  middle of the gap between two figures; when four figures cannot be told apart, the sheet is
 *  cut in equal quarters, which is where the prompt asks them to stand. */
export function figureCuts(profile: readonly number[]): [number, number][] {
  const width = profile.length;
  const quarters = Array.from({ length: FIGURES + 1 }, (_, i) => Math.floor((width * i) / FIGURES));

  const runs: [number, number][] = [];
  for (let x = 0; x < width; x++) {
    if (profile[x] <= FIGURE_COLUMN) continue;
    const last = runs.at(-1);
    if (last && x - last[1] < width * MERGE_GAP) last[1] = x + 1;
    else runs.push([x, x + 1]);
  }
  const figures = runs
    .filter(([a, b]) => b - a >= width * MIN_FIGURE)
    .sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))
    .slice(0, FIGURES)
    .sort((p, q) => p[0] - q[0]);

  const edges = figures.length === FIGURES
    ? [0, ...figures.slice(1).map(([start], i) => Math.round((figures[i][1] + start) / 2)), width]
    : quarters;
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
