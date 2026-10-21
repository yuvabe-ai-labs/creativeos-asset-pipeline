"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dubLanguageLabel, dubStyleLabel, dubVoiceLabel, furthestStage, stageUrl } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";
import { VersionList } from "./version-list";
import { VersionThumb } from "./version-thumb";

function Step({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? Check : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", done ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-3" strokeWidth={1.5} />
      {label}
    </span>
  );
}

// D375 + D383 — newest first, on the shared list: a click views the dub, Restore lives in the bar.
export function DubbingVersionHistory({ versions, activeVersionId, viewedVersionId, onView }: {
  versions: DubbingVersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (id: string) => void;
}) {
  const rows = versions.map((v) => {
    const d = v.dubbing;
    const summary = d
      ? [`${dubLanguageLabel(d.language)} dub`, d.style ? dubStyleLabel(d.style) : null, d.voice ? dubVoiceLabel(d.voice) : null].filter(Boolean).join(" · ")
      : "Dub";
    return {
      id: v.id,
      createdAt: v.createdAt,
      error: v.error,
      thumb: d ? <VersionThumb kind="video" src={stageUrl(d, furthestStage(d))} /> : undefined,
      summary,
      meta: (
        <span className="flex gap-4">
          <Step done label="Original" />
          <Step done={Boolean(d?.dubbed)} label="Dubbed" />
          <Step done={Boolean(d?.lipSynced)} label="Lip-synced" />
        </span>
      ),
    };
  });
  return <VersionList rows={rows} activeVersionId={activeVersionId} viewedVersionId={viewedVersionId} onView={onView} />;
}
