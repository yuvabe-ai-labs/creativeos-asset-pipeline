export type Position = { x: number; y: number };

// A deliberately simple v1 heuristic: drop incoming reference nodes in a tidy
// left-edge column, stepping down per existing node so a batch push doesn't
// stack on one spot. The user drags them into place; refine later if needed.
const BASE_X = 40;
const BASE_Y = 40;
const STEP_Y = 60;

export function computeStaggeredPosition(existingCount: number): Position {
  return { x: BASE_X, y: BASE_Y + existingCount * STEP_Y };
}
