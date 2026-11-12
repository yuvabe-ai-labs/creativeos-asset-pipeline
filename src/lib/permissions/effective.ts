import { ALL_PERMISSION_KEYS, areaHasLevel, isPermissionKey, splitKey, type PermissionKey } from "./catalogue";

export type EffectiveInput = {
  isOwner: boolean;
  presetKeys: readonly string[];
  granted: readonly string[];
  revoked: readonly string[];
};

// D495 §2.3. Owner → every key. Otherwise the preset's keys, plus the ticks the owner added,
// minus the ones they removed; then any tick in an area turns on that area's view (when the
// area has one). Keys the catalogue no longer knows are dropped, never trusted.
export function computeEffective(input: EffectiveInput): Set<PermissionKey> {
  if (input.isOwner) return new Set(ALL_PERMISSION_KEYS);
  const out = new Set<PermissionKey>();
  for (const k of input.presetKeys) if (isPermissionKey(k)) out.add(k);
  for (const k of input.granted) if (isPermissionKey(k)) out.add(k);
  for (const k of input.revoked) if (isPermissionKey(k)) out.delete(k);
  for (const k of [...out]) {
    const { area } = splitKey(k);
    if (areaHasLevel(area, "view")) out.add(`${area}.view` as PermissionKey);
  }
  return out;
}
