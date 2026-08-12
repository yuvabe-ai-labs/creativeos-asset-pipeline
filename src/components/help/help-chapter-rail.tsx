"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";

// The rail replaces the old map page. Video is linear — a viewer sees the current frame
// but never the shape — so the whole journey stays on screen beside the clip instead of
// living on a separate page you pass through once. Expanding a step IS selecting it:
// one piece of state drives both the open panel and the clip on the right.
export function HelpChapterRail({
  chapter,
  step,
  onSelectStep,
}: {
  chapter: HelpChapter;
  step: number;
  onSelectStep: (step: number) => void;
}) {
  const numbered = (chapter.stepStyle ?? "sequence") === "sequence";

  return (
    <div className="grid content-start gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{chapter.summary}</p>

      <Accordion
        value={[step]}
        onValueChange={(value) => {
          // `multiple` is false, so this is at most one item. Collapsing the open row
          // would leave the right pane with no clip, so re-clicking it is a no-op.
          const next = value[0];
          if (typeof next === "number") onSelectStep(next);
        }}
        className="border-t border-border"
      >
        {chapter.steps.map((s, i) => (
          <AccordionItem key={s.title} value={i + 1}>
            {/* Tailwind v4 drops the default pointer cursor on <button>, so a row reads as
                inert without it. The tint bleeds out via -mx-2/px-2 so the hover target
                looks generous while the number and title stay aligned with the panel. */}
            <AccordionTrigger
              className={cn(
                "-mx-2 gap-3 rounded-lg px-2 no-underline hover:no-underline",
                "cursor-pointer transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "text-eyebrow shrink-0 pt-0.5 text-[0.65rem]",
                  step === i + 1 ? "text-primary" : "text-muted-foreground/70",
                )}
              >
                {numbered ? String(i + 1).padStart(2, "0") : "—"}
              </span>
              <span className="flex-1 text-sm leading-snug font-medium">{s.title}</span>
            </AccordionTrigger>

            <AccordionContent>
              <ul className="grid gap-1.5 pl-9">
                {s.body.map((line) => (
                  <li
                    key={line}
                    className="relative text-sm leading-relaxed text-muted-foreground before:absolute before:-left-4 before:text-muted-foreground/40 before:content-['→']"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="text-xs text-muted-foreground">
        {numbered
          ? `${chapter.steps.length} steps — open any one to watch it.`
          : `${chapter.steps.length} ways to do this — open whichever fits.`}
      </p>
    </div>
  );
}
