"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HelpChapter } from "@/lib/help/types";
import { HelpChapterRail } from "@/components/help/help-chapter-rail";
import { HelpStepVideo } from "@/components/help/help-step-video";

// Controlled: the caller owns chapter + step so the URL stays the source of truth.
// `step` is 1-based; there is no page 0 — the rail carries the shape of the chapter.
export function HelpChapterDialog({
  chapter,
  step,
  onStepChange,
  onClose,
}: {
  chapter: HelpChapter | null;
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  if (!chapter) return null;

  const total = chapter.steps.length;
  const current = chapter.steps[step - 1] ?? chapter.steps[0];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Sized for real screen recordings: the clip is the point, so the pane holding it
          gets the room. sm:max-w-none overrides the dialog's default narrow width. */}
      <DialogContent className="flex h-[min(88vh,44rem)] w-[min(94vw,78rem)] flex-col gap-4 sm:max-w-none">
        <DialogTitle className="font-display text-xl">{chapter.question}</DialogTitle>
        <DialogDescription className="sr-only">{chapter.summary}</DialogDescription>

        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[22rem_1fr]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <HelpChapterRail chapter={chapter} step={step} onSelectStep={onStepChange} />
          </div>
          <div className="min-h-0">
            <HelpStepVideo step={current} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(step - 1)}
            disabled={step <= 1}
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
          </Button>

          <span className="text-eyebrow text-[0.65rem] text-muted-foreground">
            {step} / {total}
          </span>

          <Button size="sm" onClick={() => onStepChange(step + 1)} disabled={step >= total}>
            Next <ArrowRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
