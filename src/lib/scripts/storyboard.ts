// D380 — a shot's name on the canvas. The copilot already calls its shots S1, S2… everywhere the
// team reads them; the canvas copy prints the same names into the script text, so they survive
// every edit, and a parsed row finds its storyboard panel by its name.

/** The name of the shot at `index` (zero-based) in the script's order. */
export const shotLabel = (index: number): string => `S${index + 1}`;
