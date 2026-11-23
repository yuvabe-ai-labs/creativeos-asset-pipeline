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

const orNull = (s: string): string | null => (s.trim() === "" ? null : s);

/** Only the fields that differ from what was saved, in the database's column names. */
export function buildModelPatch(saved: SavedDetails, draft: DraftDetails): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.label !== saved.label) patch.label = draft.label;
  if (orNull(draft.pickerLabel) !== saved.pickerLabel) patch.picker_label = orNull(draft.pickerLabel);
  if (draft.providerLabel !== saved.providerLabel) patch.provider_label = draft.providerLabel;
  if (orNull(draft.description) !== saved.description) patch.description = orNull(draft.description);
  const order = parseSortOrder(draft.sortOrder);
  if (order !== null && order !== saved.sortOrder) patch.sort_order = order;
  if (draft.status !== saved.status) patch.status = draft.status;
  if (draft.status === "retired" && draft.replacedBy !== saved.replacedBy) patch.replaced_by = draft.replacedBy;
  return patch;
}
