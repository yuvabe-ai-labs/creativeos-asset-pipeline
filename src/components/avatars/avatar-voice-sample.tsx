"use client";

import { AudioLines } from "lucide-react";
import type { AvatarVoiceSample as VoiceSample } from "@/lib/avatars/schema";

// D296 — the voice reference saved from a native preview: the audio Seedance is sent on every
// later video so this avatar keeps one voice. Shown under the clip it came from.
export function AvatarVoiceSample({ sample }: { sample: VoiceSample | null }) {
  if (!sample) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <AudioLines className="size-4 text-primary" strokeWidth={1.5} />
        Voice reference saved · {sample.durationSeconds.toFixed(1)}s
      </p>
      <audio src={sample.url} controls preload="none" className="h-8 w-full" />
      <p className="text-xs text-muted-foreground">
        Sent with every video of this avatar, so the voice stays the same.
      </p>
    </div>
  );
}
