"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { furthestStage, stageUrl, type DubStage, type DubbingOutput } from "@/lib/dubbing/types";

const STAGES: { id: DubStage; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "dubbed", label: "Dubbed" },
  { id: "lipSynced", label: "Lip-synced" },
];

// D375 — the active version's three stages behind one switch; with no dub yet, the connected take.
// A new dub or finished lip sync jumps to the furthest stage: the parent keys this component by
// the dub's urls, so it remounts instead of syncing state in an effect.
export function DubbingPlayer({ dub, sourceUrl }: { dub: DubbingOutput | null; sourceUrl: string | null }) {
  const [stage, setStage] = useState<DubStage>(dub ? furthestStage(dub) : "original");
  const url = dub ? stageUrl(dub, stage) : sourceUrl;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/30 p-6">
      {dub && (
        <Tabs value={stage} onValueChange={(v) => setStage(v as DubStage)}>
          <TabsList>
            {STAGES.map((s) => (
              <TabsTrigger key={s.id} value={s.id} disabled={!stageUrl(dub, s.id)}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {url ? (
        <video key={url} src={url} controls playsInline className="max-h-full w-full rounded-xl border border-border bg-black object-contain" />
      ) : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Connect a video to dub.
        </div>
      )}
    </div>
  );
}
