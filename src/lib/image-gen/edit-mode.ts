// How the Edit tab behaves for the selected model:
//   "paint" — the user paints the region to change; we send a clean base + an alpha mask.
//   "type"  — the user types the change; region targeting is text-only (no drawing).
export type EditMode = "paint" | "type";

export function editModeForModel(supportsMask?: boolean): EditMode {
  return supportsMask ? "paint" : "type";
}
