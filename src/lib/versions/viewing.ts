// D383 — which version a focus view shows. `viewedId === null` means "follow the active
// version", so a restore (which makes the viewed version active) needs no special case.

type HasId = { id: string };

export function resolveViewedVersion<V extends HasId>(
  versions: V[],
  activeId: string | null,
  viewedId: string | null,
): { viewed: V | null; index: number; isViewingOther: boolean } {
  const viewed =
    (viewedId ? versions.find((v) => v.id === viewedId) : undefined) ??
    (activeId ? versions.find((v) => v.id === activeId) : undefined) ??
    null;
  return {
    viewed,
    index: viewed ? versions.indexOf(viewed) : -1,
    isViewingOther: viewed !== null && viewed.id !== activeId,
  };
}

/** Versions are newest first, so +1 steps to an older version and -1 to a newer one. */
export function stepVersionId<V extends HasId>(versions: V[], fromId: string | null, delta: 1 | -1): string | null {
  if (versions.length === 0) return null;
  const from = fromId ? versions.findIndex((v) => v.id === fromId) : -1;
  if (from === -1) return versions[0].id;
  const to = from + delta;
  return to >= 0 && to < versions.length ? versions[to].id : null;
}

export function nextViewedId(activeId: string | null, targetId: string): string | null {
  return targetId === activeId ? null : targetId;
}
