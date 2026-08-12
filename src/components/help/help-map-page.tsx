"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";

// Page 1 of every chapter, including two-step ones: the viewer arrived having asked a
// question, and this is where it gets answered before the mechanics start. Captions are
// derived from step titles so a chapter's sequence is authored once and cannot drift.
export function HelpMapPage({
  chapter,
  onSelectStep,
}: {
  chapter: HelpChapter;
  onSelectStep: (step: number) => void;
}) {
  const connected = (chapter.mapStyle ?? "sequence") === "sequence";

  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {chapter.summary}
      </p>

      <ol className="flex flex-wrap items-stretch gap-2">
        {chapter.steps.map((s, i) => (
          <li key={s.title} className="flex items-stretch gap-2">
            <Button
              variant="outline"
              onClick={() => onSelectStep(i + 1)}
              className={cn(
                // h-auto/items-start override the Button size defaults so the block can
                // hold a two-line body — tailwind-merge resolves the conflict.
                "h-auto w-40 flex-col items-start gap-2 whitespace-normal rounded-xl p-3 text-left",
                "shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:-translate-y-0.5 hover:border-primary/40",
              )}
            >
              <span className="text-eyebrow text-[0.65rem] text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs leading-snug text-foreground">{s.title}</span>
            </Button>
            {connected && i < chapter.steps.length - 1 && (
              <span aria-hidden className="self-center text-muted-foreground/40">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        {connected
          ? `${chapter.steps.length} steps — click any step to jump to it.`
          : `${chapter.steps.length} ways to do this — click whichever fits.`}
      </p>
    </div>
  );
}
