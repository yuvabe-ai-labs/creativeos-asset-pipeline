"use client";

import { Languages } from "lucide-react";
import { workingHint, workingTitle, type WorkingKind } from "@/lib/dubbing/working-steps";

// Over the player while a dub or lip sync runs: the frame being worked on, dimmed and softened,
// with what is happening in words. Uses the system's "working" treatment (.thinking-pill,
// .text-shimmer-brand) and the indeterminate shimmer bar.
export function DubbingWorkingOverlay({ kind, language, posterUrl }: { kind: WorkingKind; language: string; posterUrl: string | null }) {
  return (
    <div role="status" className="relative grid flex-1 place-items-center overflow-hidden rounded-xl border border-border bg-black">
      {posterUrl && (
        <video
          src={`${posterUrl}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          aria-hidden
          className="absolute inset-0 size-full scale-105 object-cover opacity-40 blur-md"
        />
      )}
      <div className="animate-rise relative mx-6 flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card/95 p-6 shadow-lg">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Languages className="size-3.5" strokeWidth={1.5} />
          {language}
        </span>
        <div className="thinking-pill w-fit rounded-full px-3 py-1.5">
          <span className="text-shimmer-brand font-display text-lg font-semibold">{workingTitle(kind, language)}…</span>
        </div>
        <p className="text-sm text-muted-foreground">{workingHint(kind)}</p>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="animate-shimmer h-full w-1/3 rounded-full bg-primary/60" />
        </div>
        <p className="text-xs text-muted-foreground">You can close this. We&apos;ll let you know when it&apos;s ready.</p>
      </div>
    </div>
  );
}
