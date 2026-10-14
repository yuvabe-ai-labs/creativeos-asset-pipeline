"use client";

import { Check, Loader2, Sparkles } from "lucide-react";

// D301 — what "Choose a voice for me" does next, in plain words. The voice itself is made in the
// Preview step; how it is kept on each model is the Studio's business, not the operator's.
export function AvatarVoiceAutoPanel({ name, saved, saving }: { name: string; saved: boolean; saving: boolean }) {
  return (
    <div className="flex gap-3 rounded-xl border p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">
        <Sparkles className="size-4" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">We&apos;ll pick a voice that suits {name}</p>
          {saving ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              Saving…
            </span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text" aria-live="polite">
              <Check className="size-3.5" strokeWidth={1.5} />
              Saved
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Continue to Preview to hear {name} say a line. Not right? Make another until it is. Once you
          keep one, {name} sounds the same in every video.
        </p>
      </div>
    </div>
  );
}
