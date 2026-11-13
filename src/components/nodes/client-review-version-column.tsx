"use client";

import { useMemo } from "react";
import { VersionList, type VersionRow } from "./version-list";
import { VersionThumb } from "./version-thumb";
import type { ReviewComment, ReviewVersion } from "@/lib/client-review/wire";

// D498 — the Client review focus view's left column: the shared version list, newest first.
// A row opens that version in the centre (its link, video and switch) and its comments.
// The column's "Versions" heading is the focus view's. No approval and no "Active" mark: every version is live at its own link (D496).
export function ClientReviewVersionColumn({
  versions,
  comments,
  viewedId,
  onView,
}: {
  versions: ReviewVersion[];
  comments: ReviewComment[];
  viewedId: string | null;
  onView: (id: string) => void;
}) {
  const rows = useMemo<VersionRow[]>(() => {
    const counts = new Map<string, number>();
    for (const c of comments) counts.set(c.versionId, (counts.get(c.versionId) ?? 0) + 1);
    return versions.map((v) => {
      const n = counts.get(v.id) ?? 0;
      return {
        id: v.id,
        createdAt: v.createdAt,
        error: null,
        thumb: <VersionThumb kind="video" src={v.videoUrl} />,
        // Short enough to show whole beside the thumb; the rest opens with the row.
        summary: `${n} ${n === 1 ? "comment" : "comments"}`,
        meta: (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {v.title && <p className="break-words text-foreground">{v.title}</p>}
            <p>{v.allowDownload ? "Client can download" : "Download off for the client"}</p>
          </div>
        ),
      };
    });
  }, [versions, comments]);

  return (
    <VersionList
      rows={rows}
      activeVersionId={null}
      viewedVersionId={viewedId}
      onView={onView}
      showApproval={false}
      hideHeader
    />
  );
}
