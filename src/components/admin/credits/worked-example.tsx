import { Fragment } from "react";
import { creditNumber, stepWords, workedExample, type Settings } from "@/lib/admin/credits-page";
import { cn } from "@/lib/utils";

/**
 * The worked sum for the simple example run ($0.0123): what we pay, × 1,000, the margin when there is
 * one, then rounded up to the step. With `live`, the last link says what today's settings charge.
 */
export function WorkedExample({ settings, live }: { settings: Settings; live?: Settings }) {
  const w = workedExample(settings, live);
  const links = [
    { value: w.usd, caption: "a run costs us" },
    { op: "× 1,000", value: w.atCost, caption: "credits at cost" },
    ...(w.withMargin ? [{ op: `+ ${w.margin}% margin`, value: w.withMargin, caption: "with the margin" }] : []),
    { op: `round up to ${stepWords(w.step)}`, value: creditNumber(w.charged), caption: `credits charged${w.was !== null ? `, was ${creditNumber(w.was)}` : ""}`, last: true },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem]" aria-live="polite">{w.sentence}</p>
      <ol aria-hidden className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        {links.map((l) => (
          <Fragment key={l.caption}>
            {l.op && <li className="text-center text-xs text-muted-foreground md:px-1">{l.op}</li>}
            <li className={cn("flex flex-col gap-0.5 rounded-xl border bg-muted/40 px-4 py-3 md:min-w-[110px] md:flex-1", l.last && "border-primary/40 bg-card")}>
              <span className="font-display text-lg font-semibold tabular-nums">{l.value}</span>
              <span className="text-xs text-muted-foreground">{l.caption}</span>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
