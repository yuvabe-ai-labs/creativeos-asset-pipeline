"use client";

import type { ReactNode } from "react";
import { versionLabelsById } from "@/lib/generations/version-labels";
import type { VersionViewing } from "@/hooks/use-version-viewing";
import { PromptVersionHistory, type VersionSummary } from "./prompt-version-history";
import { ViewingTag } from "./viewing-tag";
import { VersionViewingBar } from "./version-viewing-bar";
import { VersionOutputEmpty } from "./version-output-empty";

/**
 * D383 — the prompt nodes' History, in the media nodes' shape: the list in a raised middle
 * column, the version on screen in the output column beside it, read-only. Shared by
 * PromptFocusShell (Video Prompt, Multishot Prompt) and the image Prompt node's own view.
 */
export function PromptHistoryPane({
  versions,
  activeVersionId,
  viewing,
  outputLabel,
  outputIcon,
  renderVersionOutput,
  canRestore,
  restoring,
  onRestore,
  emptyNoun = "prompt",
}: {
  versions: VersionSummary[];
  activeVersionId: string | null;
  viewing: VersionViewing<VersionSummary>;
  outputLabel: string;
  outputIcon: ReactNode;
  renderVersionOutput: (version: VersionSummary) => ReactNode;
  canRestore: boolean;
  restoring: boolean;
  onRestore: (versionId: string) => void;
  emptyNoun?: string;
}) {
  if (versions.length === 0) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">No versions yet. Generate once and every run is kept here.</p>
      </div>
    );
  }
  const labelById = versionLabelsById(versions);
  const viewed = viewing.viewed;
  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      {/* D433 — Back and Restore head the list the version was picked from; the output beside it
          only names the version on screen, so it never moves. */}
      <div className="flex h-full w-[54%] shrink-0 flex-col gap-3 overflow-y-auto border-x border-primary/25 bg-card px-6 py-5 panel-raised">
        {viewing.isViewingOther && viewed && (
          <VersionViewingBar
            viewedLabel={labelById.get(viewed.id) ?? ""}
            viewedCreatedAt={viewed.createdAt}
            activeLabel={activeVersionId ? labelById.get(activeVersionId) ?? null : null}
            canRestore={canRestore && !viewed.error && Boolean(viewed.output)}
            restoring={restoring}
            onBack={viewing.backToActive}
            onRestore={() => onRestore(viewed.id)}
          />
        )}
        <PromptVersionHistory versions={versions} activeVersionId={activeVersionId} viewedVersionId={viewed?.id ?? null} onView={viewing.view} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        <div className="flex h-8 shrink-0 items-center gap-3">
          <div className="flex items-center gap-1.5">
            {outputIcon}
            <span className="text-eyebrow">{outputLabel}</span>
          </div>
          {viewing.isViewingOther && viewed && <ViewingTag label={labelById.get(viewed.id) ?? ""} />}
        </div>
        {viewed && (viewed.error || !viewed.output ? <VersionOutputEmpty noun={emptyNoun} /> : renderVersionOutput(viewed))}
      </div>
    </div>
  );
}
