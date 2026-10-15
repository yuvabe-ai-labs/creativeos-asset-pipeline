"use client";

import { useState, type ReactNode } from "react";
import { Check, Languages } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { dubLanguageLabel, furthestStage, stageUrl, type DubStage, type DubbingOutput } from "@/lib/dubbing/types";
import type { WorkingKind } from "@/lib/dubbing/working-steps";
import { DubbingWorkingOverlay } from "./dubbing-working-overlay";

const STAGES: { id: DubStage; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "dubbed", label: "Dubbed" },
  { id: "lipSynced", label: "Lip-synced" },
];

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "note" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm",
        tone === "plain" && "bg-black/60 text-white",
        tone === "good" && "bg-primary/85 text-primary-foreground",
        tone === "note" && "bg-white/85 text-neutral-900",
      )}
    >
      {children}
    </span>
  );
}

// D375 — the active version's three stages behind one switch; with no dub yet, the connected take.
// A new dub or finished lip sync jumps to the furthest stage and rises in: the parent keys this
// component by the dub's urls, so it remounts instead of syncing state in an effect. While a job
// runs, the frame being worked on sits under the working overlay.
export function DubbingPlayer({ dub, sourceUrl, running, runningLanguage }: {
  dub: DubbingOutput | null;
  sourceUrl: string | null;
  running: WorkingKind | null;
  /** The language the running job is for: the picked one for a dub, the dub's own for a lip sync. */
  runningLanguage: string;
}) {
  const [stage, setStage] = useState<DubStage>(dub ? furthestStage(dub) : "original");
  const url = dub ? stageUrl(dub, stage) : sourceUrl;
  const poster = running === "lipsync" ? dub?.dubbed ?? sourceUrl : sourceUrl;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/30 p-6">
      {dub && !running && (
        <Tabs value={stage} onValueChange={(v) => setStage(v as DubStage)}>
          <TabsList>
            {STAGES.map((s) => (
              <TabsTrigger key={s.id} value={s.id} disabled={!stageUrl(dub, s.id)}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {running ? (
        <DubbingWorkingOverlay kind={running} language={runningLanguage} posterUrl={poster} />
      ) : url ? (
        <div className={cn("relative min-h-0", dub && "animate-rise")}>
          <video key={url} src={url} controls playsInline className="max-h-full w-full rounded-xl border border-border bg-black object-contain" />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
            <Chip>
              <Languages className="size-3.5" strokeWidth={1.5} />
              {dub && stage !== "original" ? dubLanguageLabel(dub.language) : "Original"}
            </Chip>
            {dub && stage === "dubbed" && !dub.lipSynced && <Chip tone="note">Mouth not matched yet</Chip>}
            {dub && stage === "lipSynced" && (
              <Chip tone="good">
                <Check className="size-3.5" strokeWidth={1.5} />
                Lip-synced
              </Chip>
            )}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Connect a video to dub.
        </div>
      )}
    </div>
  );
}
