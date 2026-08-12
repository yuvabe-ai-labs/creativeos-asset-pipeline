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

        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[24rem_1fr]">
          {/* px-2 matches the rail rows' -mx-2 hover bleed, so the tint has somewhere to
              go. Without it the rows overhang the container, and since overflow-y is set,
              CSS computes overflow-x to auto rather than visible — a stray horizontal
              scrollbar. overflow-x-hidden guards against sub-pixel rounding on top. */}
          <div className="min-h-0 overflow-x-hidden overflow-y-auto px-2">
            <HelpChapterRail chapter={chapter} step={step} onSelectStep={onStepChange} />
          </div>
          <div className="min-h-0">
            <HelpStepVideo step={current} />
          </div>
        </div>

        {/* Three columns rather than justify-between so the counter sits dead centre
            regardless of how wide the button groups are. Stepping is one paired group on
            the left; Close is a separate concern and sits apart from it. */}
        <div className="grid grid-cols-3 items-center gap-4 border-t pt-3">
          <div className="flex items-center gap-2 justify-self-start">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStepChange(step - 1)}
              disabled={step <= 1}
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
            </Button>
            <Button
              size="sm"
              onClick={() => onStepChange(step + 1)}
              disabled={step >= total}
            >
              Next <ArrowRight className="size-4" strokeWidth={1.5} />
            </Button>
          </div>

          <span className="text-eyebrow justify-self-center text-[0.65rem] text-muted-foreground">
            {step} / {total}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="justify-self-end"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
