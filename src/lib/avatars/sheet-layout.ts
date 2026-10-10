// D340 — where each view sits in the composed sheet strip. Pure, so it is tested without sharp.

export type StripLayout = { widths: number[]; lefts: number[]; width: number; height: number };

/** Every view scaled to `height`, keeping its own shape, laid left to right with `gap` between. */
export function stripLayout(sizes: { width: number; height: number }[], height: number, gap: number): StripLayout {
  const widths = sizes.map((s) => Math.round((s.width / s.height) * height));
  const lefts: number[] = [];
  let x = 0;
  for (const w of widths) {
    lefts.push(x);
    x += w + gap;
  }
  return { widths, lefts, width: Math.max(0, x - gap), height };
}
