"use client";

import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  isStepDone, isStepLoading, isStepOpen, stepStatusLine, STUDIO_STEPS, type StudioSnapshot, type StudioStepId,
} from "@/lib/avatars/studio";

type Props = {
  current: StudioStepId;
  snapshot: StudioSnapshot;
  onGo: (id: StudioStepId) => void;
};

// D297 — the Studio's five steps, down the side. Each shows its number (a check once done, a lock
// until Look is done) and a one-line status. On narrow screens it becomes a row of titles.
export function AvatarStudioStepper({ current, snapshot, onGo }: Props) {
  return (
    <nav aria-label="Avatar steps" className="self-start lg:sticky lg:top-6">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {STUDIO_STEPS.map((step, i) => {
          const isCurrent = step.id === current;
          const done = isStepDone(step.id, snapshot);
          const open = isStepOpen(step.id, snapshot);
          const skipped = snapshot.skipped.has(step.id) && !done;
          const loading = isStepLoading(step.id, snapshot);
          return (
            <li key={step.id} className="relative shrink-0">
              {i < STUDIO_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[1.35rem] top-10 hidden h-[calc(100%-1.75rem)] w-[1.5px] lg:block",
                    done ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}
              <Button
                variant="ghost"
                disabled={!open}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onGo(step.id)}
                className={cn(
                  "h-auto w-full items-start justify-start gap-2.5 whitespace-normal px-2.5 py-2 text-left",
                  isCurrent && "bg-primary/5 hover:bg-primary/10",
                )}
              >
                {loading && !isCurrent ? (
                  <Skeleton className="size-6 shrink-0 rounded-full" />
                ) : (
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-semibold tabular-nums",
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : done
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-muted-foreground",
                    skipped && "border-dashed",
                  )}
                >
                  {done && !isCurrent ? <Check className="size-3.5" strokeWidth={1.5} />
                    : !open ? <Lock className="size-3" strokeWidth={1.5} />
                      : i + 1}
                </span>
                )}
                <span className="flex min-w-0 flex-col pt-0.5">
                  <span className={cn("text-sm leading-tight", isCurrent ? "font-semibold" : "font-medium")}>
                    {step.title}
                  </span>
                  {loading ? (
                    <Skeleton className="mt-1 hidden h-3 w-20 lg:block" />
                  ) : (
                    <span className="hidden text-xs font-normal leading-snug text-muted-foreground lg:block">
                      {stepStatusLine(step.id, snapshot)}
                    </span>
                  )}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
