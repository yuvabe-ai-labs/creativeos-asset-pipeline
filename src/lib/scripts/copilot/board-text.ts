// Piece 5.1 (D512) — the storyboard as the copilot reads it at Visualise: one line per shot with its
// panel, how many versions it has and which is picked, then who has no avatar and what has no
// picture. Built from the same pure functions the board shows (board-facts.ts), so the copilot and
// the page never disagree about what is drawn.

export type PanelState = "ready" | "out_of_date" | "not_yet" | "failed" | "drawing" | "waiting";
export type BoardFacts = {
  shots: { id: string; label: string; panel: PanelState; versions: number; picked: number | null }[];
  /** Names of characters on screen whose avatar is not ready to draw. */
  castWithoutAvatar: string[];
  /** "the café (location)", "the bottle (product)". */
  withoutPicture: string[];
};

const PANEL_WORDS: Record<PanelState, string> = {
  ready: "panel ready",
  out_of_date: "panel out of date",
  not_yet: "no panel yet",
  failed: "the last draw failed",
  drawing: "being drawn",
  waiting: "waiting for an avatar",
};

function shotLine(s: BoardFacts["shots"][number]): string {
  const parts = [PANEL_WORDS[s.panel]];
  if (s.versions > 0) parts.push(`${s.versions} version${s.versions === 1 ? "" : "s"}`);
  if (s.picked !== null) parts.push(`version ${s.picked} picked`);
  return `${s.label} (id ${s.id}): ${parts.join(", ")}`;
}

export function boardText(f: BoardFacts): string {
  return [
    ...f.shots.map(shotLine),
    "",
    f.castWithoutAvatar.length
      ? `Characters with no avatar ready to draw: ${f.castWithoutAvatar.join(", ")}`
      : "Every character on screen has an avatar ready to draw.",
    f.withoutPicture.length
      ? `Locations and products with no picture: ${f.withoutPicture.join(", ")}`
      : "Every location and product has a picture.",
  ].join("\n");
}
