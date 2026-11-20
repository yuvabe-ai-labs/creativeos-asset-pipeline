import type { EditOp } from "./output";
import { isDocTarget, parseFieldPath } from "./fields";

// Piece 5.1 §3.3 (D513) — what one request to the copilot does at Visualise. Casting, the lead,
// products and locations, and a change to one shot or one field apply at once, as typing on the
// board does. A change across several shots, or to which shots or characters there are, comes as a
// before-and-after card (it relaxes D489 (second) for the copilot's cards only). The reel's notes stay
// behind a reopen. One request has one outcome, so nothing is ever half done.

export type VisualiseRoute = { kind: "apply" } | { kind: "card" } | { kind: "refuse"; reason: string };

export const VISUALISE_REFUSALS = {
  notes: "The reel's notes and open items change only while the script is being written. Reopen the script to change them.",
  replace: "Replacing the whole script would lose every panel on the board. Reopen the script to paste a new one.",
} as const;

/** Adding, removing or reshaping shots, and characters (whose name and description are drawn). */
const ON_A_CARD = new Set<EditOp["op"]>([
  "insert_shot", "remove_shot", "split_shot", "move_shot", "add_cast", "remove_cast", "update_cast",
]);

function touchesNotes(op: EditOp): boolean {
  if (op.op === "confirm_item") return true;
  if (op.op !== "set_field" || !op.path) return false;
  const target = parseFieldPath(op.path);
  return target !== null && !isDocTarget(target);
}

export function routeVisualiseOps(ops: EditOp[], touchedShotIds: string[]): VisualiseRoute {
  if (ops.some(touchesNotes)) return { kind: "refuse", reason: VISUALISE_REFUSALS.notes };
  if (ops.some((o) => ON_A_CARD.has(o.op)) || touchedShotIds.length > 1) return { kind: "card" };
  return { kind: "apply" };
}
