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

export function isScriptStage(value: unknown): value is ScriptStage {
  return typeof value === "string" && (SCRIPT_STAGES as readonly string[]).includes(value);
}
