"use client";

import { useState, type ReactNode } from "react";
import { AudioLines, Clapperboard } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VersionOutputEmpty } from "./version-output-empty";
import { furthestStage, stageUrl, type DubStage, type DubbingOutput } from "@/lib/dubbing/types";

const STAGES: { id: DubStage; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "dubbed", label: "Dubbed" },
  { id: "lipSynced", label: "Lip-synced" },
];

// D375 — the right column, laid out like Video Gen's: an eyebrow, the stage switch beside it, the
// video below at its own shape. While a job runs, the video it works on stays in place under the same veil
// Video Gen gives a voice change. The parent keys this by the dub's urls, so a new result
// remounts on the furthest stage instead of syncing state in an effect.
export function DubbingPlayer({ dub, sourceUrl, workingLabel, stepper, banner, failed = false }: {
  dub: DubbingOutput | null;
  sourceUrl: string | null;
  /** "Dubbing into Tamil…" while a job runs, else null. */
  workingLabel: string | null;
  /** D383 — the version stepper and viewing bar, and whether the version on screen failed. */
  stepper?: ReactNode;
  banner?: ReactNode;
  failed?: boolean;
}) {
  const [stage, setStage] = useState<DubStage>(dub ? furthestStage(dub) : "original");
  // D384 — the player's shape: measured from the video, 9:16 until then.
  const [ratio, setRatio] = useState(9 / 16);
  const url = workingLabel ? (dub?.dubbed && stage !== "original" ? dub.dubbed : sourceUrl) : dub ? stageUrl(dub, stage) : sourceUrl;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 bg-muted/20 px-6 py-5">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Video</span>
        </div>
        {dub && (
          <Tabs value={stage} onValueChange={(v) => setStage(v as DubStage)}>
            <TabsList>
              {STAGES.map((s) => (
                <TabsTrigger key={s.id} value={s.id} disabled={Boolean(workingLabel) || !stageUrl(dub, s.id)}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {stepper && <div className="ml-auto">{stepper}</div>}
      </div>
      {banner}
      <div className="min-h-0 flex-1">
        {failed ? (
          <VersionOutputEmpty noun="dub" />
        ) : url ? (
          <div className="relative h-full w-fit max-w-full">
            <video key={url} src={url} controls={!workingLabel} playsInline className="h-full max-w-full rounded-xl border border-border bg-muted/20"
              style={{ aspectRatio: ratio }}
              onLoadedMetadata={(e) => {
                const { videoWidth, videoHeight } = e.currentTarget;
                if (videoWidth > 0 && videoHeight > 0) setRatio(videoWidth / videoHeight);
              }}
            />
            {workingLabel && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-sm font-medium shadow-card">
                  <AudioLines className="size-4 animate-pulse text-primary" strokeWidth={1.5} />
                  {workingLabel}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-border">
            <div className="px-8 text-center">
              <Clapperboard className="mx-auto size-8 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No video yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Add the video to dub.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
