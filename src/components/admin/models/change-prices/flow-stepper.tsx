import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Prices", "When", "Review"] as const;

/** Prices, When, Review: where the change-prices flow is. `at` is 1-based. */
export function FlowStepper({ at }: { at: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Steps" className="flex items-center gap-2 text-[0.8125rem]">
      {STEPS.map((name, i) => {
        const n = i + 1;
        const done = n < at;
        const on = n === at;
        return (
          <Fragment key={name}>
            <li aria-current={on ? "step" : undefined} className={cn("flex items-center gap-1.5", on ? "font-medium text-foreground" : "text-muted-foreground")}>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border text-[0.7rem] tabular-nums",
                  done ? "border-primary bg-primary text-primary-foreground" : on ? "border-primary text-primary" : "border-border",
                )}
              >
                {done ? <Check aria-hidden strokeWidth={1.5} className="size-3" /> : n}
              </span>
              {name}
              {done && <span className="sr-only">, done</span>}
            </li>
            {n < STEPS.length && <li aria-hidden className="h-px w-6 bg-border" />}
          </Fragment>
        );
      })}
    </ol>
  );
}
