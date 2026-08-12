"use client";

import { ArrowLeft, ArrowRight, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";
import { HelpMapPage } from "@/components/help/help-map-page";
import { HelpStepPage } from "@/components/help/help-step-page";

// Controlled: the caller owns chapter + step so the URL stays the source of truth.
// `step` is a page index — 0 is the map, 1..n are the content steps.
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
  const onMap = step === 0;
  const current = chapter.steps[step - 1];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-full overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="font-display text-xl">{chapter.question}</DialogTitle>
        <DialogDescription className="sr-only">
          {onMap ? chapter.summary : (current?.title ?? chapter.summary)}
        </DialogDescription>

        <div className="py-2">
          {onMap || !current ? (
            <HelpMapPage chapter={chapter} onSelectStep={onStepChange} />
          ) : (
            <HelpStepPage step={current} index={step} total={total} />
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(step - 1)}
            disabled={onMap}
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onStepChange(0)}
              disabled={onMap}
              aria-label="Back to overview"
            >
              <Map className="size-4" strokeWidth={1.5} />
            </Button>
            {chapter.steps.map((s, i) => (
              <Button
                key={s.title}
                variant="ghost"
                size="icon-sm"
                onClick={() => onStepChange(i + 1)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={step === i + 1}
                className="size-4 p-0"
              >
                <span
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    step === i + 1 ? "bg-primary" : "bg-border",
                  )}
                />
              </Button>
            ))}
          </div>

          <Button size="sm" onClick={() => onStepChange(step + 1)} disabled={step >= total}>
            Next <ArrowRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
