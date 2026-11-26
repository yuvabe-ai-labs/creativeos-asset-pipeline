"use client";

import { Info } from "lucide-react";
import { MARGIN_ERROR, MARGIN_HINT, ROUND_STEPS, type CreditRunRow } from "@/lib/admin/credits-page";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { CreditExampleRuns } from "./credit-example-runs";
import type { Step } from "./use-change-credit-settings";

/** The flow's first step: the margin, the rounding step, and what they do to three example runs. */
export function CreditSettingsStep({
  margin,
  step,
  invalid,
  examples,
  filledIn,
  onMargin,
  onStep,
}: {
  margin: string;
  step: Step;
  invalid: boolean;
  /** The example runs now and with the settings typed (as now while the margin needs a fix). */
  examples: CreditRunRow[];
  /** "the 1 Dec change" when the scheduled change is filled in. */
  filledIn: string | null;
  onMargin: (text: string) => void;
  onStep: (step: Step) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {filledIn && (
        <p className="flex items-start gap-2.5 rounded-xl border bg-muted/40 px-4 py-3 text-[0.8125rem]">
          <Info aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            {filledIn.charAt(0).toUpperCase() + filledIn.slice(1)} is filled in. Saving on that day replaces it.
          </span>
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="credits-margin" className="text-sm font-medium">Margin</label>
        <InputGroup className="w-[120px]">
          <InputGroupInput
            id="credits-margin"
            value={margin}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby="credits-margin-why"
            onChange={(e) => onMargin(e.target.value)}
          />
          <InputGroupAddon align="inline-end" aria-hidden className="text-xs text-muted-foreground">%</InputGroupAddon>
        </InputGroup>
        <p id="credits-margin-why" className={cn("text-xs", invalid ? "text-destructive-text" : "text-muted-foreground")}>
          {invalid ? MARGIN_ERROR : MARGIN_HINT}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="credits-step-label" className="text-sm font-medium">Round up to</span>
        <RadioGroup
          aria-labelledby="credits-step-label"
          value={String(step)}
          onValueChange={(v) => onStep(Number(v) as Step)}
          className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {ROUND_STEPS.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 hover:bg-card/70 has-data-checked:bg-card has-data-checked:font-medium has-data-checked:shadow-card"
            >
              <RadioGroupItem value={String(s)} />
              {s === 1 ? "1 credit" : `${s} credits`}
            </label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">Always up, so a run never charges less than it costs us.</p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">What this does</h3>
        <CreditExampleRuns rows={examples} />
      </div>
    </div>
  );
}
