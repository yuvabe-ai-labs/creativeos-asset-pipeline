// src/hooks/use-version-viewing.ts
"use client";

import { useState } from "react";
import { nextViewedId, resolveViewedVersion, stepVersionId } from "@/lib/versions/viewing";

export type VersionViewing<V> = {
  viewed: V | null;
  index: number;
  total: number;
  isViewingOther: boolean;
  view: (id: string) => void;
  step: (delta: 1 | -1) => void;
  backToActive: () => void;
};

/**
 * D383 — the version a focus view shows. Local, never written anywhere. Resets when the view
 * closes and when the viewed version becomes active (a restore). `onLeaveActive` runs whenever the
 * view moves off the active version, so a caller can switch off modes that act on the active
 * output (annotate, edit, change voice).
 *
 * `useState` + compare-during-render, not an effect or a ref read: the same idiom
 * VersionList used for its expanded set (react-hooks/refs forbids reading refs in render).
 */
export function useVersionViewing<V extends { id: string }>(
  versions: V[],
  activeVersionId: string | null,
  open: boolean,
  onLeaveActive?: () => void,
): VersionViewing<V> {
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [seen, setSeen] = useState({ open, activeVersionId });
  // Intended: if a new version becomes active (a teammate's generation lands) while an older one
  // is on screen, the view stays on the older one; the viewing bar names the version the node now uses.
  if (seen.open !== open || seen.activeVersionId !== activeVersionId) {
    setSeen({ open, activeVersionId });
    if (!open || activeVersionId === viewedId) setViewedId(null);
  }

  const { viewed, index, isViewingOther } = resolveViewedVersion(versions, activeVersionId, viewedId);

  function view(id: string) {
    const next = nextViewedId(activeVersionId, id);
    if (next !== null) onLeaveActive?.();
    setViewedId(next);
  }

  return {
    viewed,
    index,
    total: versions.length,
    isViewingOther,
    view,
    step: (delta) => {
      const id = stepVersionId(versions, viewed?.id ?? null, delta);
      if (id) view(id);
    },
    backToActive: () => setViewedId(null),
  };
}
