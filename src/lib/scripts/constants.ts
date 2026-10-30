// Spec 1 (script copilot) — the stages a script moves through. Spec 2 owns "Mark final"
// (generate → visualise); spec 4 owns "Send" and "Approve" (visualise → in_review → approved).
export const SCRIPT_STAGES = ["generate", "visualise", "in_review", "approved"] as const;
export type ScriptStage = (typeof SCRIPT_STAGES)[number];

export const SCRIPT_STAGE_LABEL: Record<ScriptStage, string> = {
  generate: "Generate",
  visualise: "Visualise",
  in_review: "In review",
  approved: "Approved",
};

/** The gallery's Scripts tab drags `{ scriptId }` under this type (mirrors AVATAR_DRAG_MIME). */
export const SCRIPT_DRAG_MIME = "application/x-creativeos-script";

// D446 — a product image or location plate: a photo, never svg (the avatar image rule).
export const SCRIPT_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
export const SCRIPT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const SCRIPT_IMAGE_MAX_LABEL = "15 MB";

export function isScriptStage(value: unknown): value is ScriptStage {
  return typeof value === "string" && (SCRIPT_STAGES as readonly string[]).includes(value);
}

/** D384 — why a script can't be deleted, in the order the database checks them (the first wins). */
export const SCRIPT_DELETE_BLOCKS = ["has_canvas", "shared", "drawing"] as const;
export type ScriptDeleteBlock = (typeof SCRIPT_DELETE_BLOCKS)[number];

/** The reason a person sees, from the route's 409 and from the card's dialog alike. */
export const SCRIPT_DELETE_BLOCKED: Record<ScriptDeleteBlock, string> = {
  has_canvas: "A canvas was started from this script, so it can't be deleted.",
  shared: "This script has been shared with the client, so it can't be deleted.",
  drawing: "A panel is still being drawn. Try again when it finishes.",
};

/** D449 — starting points for a location plate's Redraw note: physical changes to the set. */
export const PLATE_REDRAW_SUGGESTIONS = ["Warmer light", "Fewer props", "Wider view", "More lived-in"];
