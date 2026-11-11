"use client";

import { VersionList, type VersionRow } from "@/components/nodes/version-list";
import { VersionThumb } from "@/components/nodes/version-thumb";
import type { PanelTake } from "@/lib/scripts/visualise/schema";

// D489 — a panel's takes in the one version list every version uses (D180, D383): a row click views
// the take, and the viewing bar sets it. This file supplies only what is particular to a take.
export function PanelVersionHistory({ versions, pickId, viewedId, onView }: {
  /** Finished takes, newest first. */
  versions: PanelTake[];
  pickId: string | null;
  viewedId: string | null;
  onView: (takeId: string) => void;
}) {
  const rows: VersionRow[] = versions.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    error: t.status === "failed" ? (t.error ?? "This take failed.") : null,
    thumb: <VersionThumb kind="image" src={t.url} />,
    summary: t.promptEdited ? "Drawn from an edited prompt" : undefined,
  }));
  return <VersionList rows={rows} activeVersionId={pickId} viewedVersionId={viewedId} onView={onView} showApproval={false} />;
}
