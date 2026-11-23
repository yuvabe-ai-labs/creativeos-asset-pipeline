export type SavedDetails = {
  label: string;
  pickerLabel: string | null;
  providerLabel: string;
  description: string | null;
  status: string;
  replacedBy: string | null;
  sortOrder: number;
};

// What the admin has typed so far; text fields are raw strings, no replacement is null.
export type DraftDetails = {
  label: string;
  pickerLabel: string;
  providerLabel: string;
  description: string;
  sortOrder: string;
  status: string;
  replacedBy: string | null;
};

export function isStatusDisabled(status: string, canGoLive: boolean): boolean {
  return status === "live" && !canGoLive;
}

export function parseSortOrder(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) ? n : null;
}

const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** Only the fields that differ from what was saved, in the database's column names. Text is trimmed. */
export function buildModelPatch(saved: SavedDetails, draft: DraftDetails): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.label.trim() !== saved.label) patch.label = draft.label.trim();
  if (orNull(draft.pickerLabel) !== saved.pickerLabel) patch.picker_label = orNull(draft.pickerLabel);
  if (draft.providerLabel.trim() !== saved.providerLabel) patch.provider_label = draft.providerLabel.trim();
  if (orNull(draft.description) !== saved.description) patch.description = orNull(draft.description);
  const order = parseSortOrder(draft.sortOrder);
  if (order !== null && order !== saved.sortOrder) patch.sort_order = order;
  if (draft.status !== saved.status) patch.status = draft.status;
  if (draft.status === "retired" && draft.replacedBy !== saved.replacedBy) patch.replaced_by = draft.replacedBy;
  return patch;
}

/** What the replacement select shows. A replacement that has left live is named as such. */
export function replacementText(
  replacedBy: string | null,
  replacements: Array<{ id: string; label: string }>,
  stale: { id: string; label: string } | null,
): string {
  if (replacedBy === null) return "No replacement";
  const live = replacements.find((r) => r.id === replacedBy);
  if (live) return live.label;
  return `${stale?.id === replacedBy ? stale.label : replacedBy} (no longer live)`;
}

const SAVE_ERROR = "Could not save. Try again.";

/** Runs a save action; a call that throws (network, server) answers with the plain error. */
export async function runSave(call: () => Promise<{ error?: string }>): Promise<{ error?: string }> {
  try {
    return await call();
  } catch {
    return { error: SAVE_ERROR };
  }
}
