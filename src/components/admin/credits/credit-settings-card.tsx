"use client";

import { MARGIN_ERROR, MARGIN_HINT, ROUND_STEPS, type Settings } from "@/lib/admin/credits-page";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { LockedSettings, SettingRow } from "./locked-settings";
import { WorkedExample } from "./worked-example";
import type { Step } from "./use-change-credit-settings";

/** "New settings": the margin and the step, the two fixed settings with why, and the worked example live. */
export function CreditSettingsCard({
  margin,
  step,
  draft,
  live,
  onMargin,
  onStep,
}: {
  margin: string;
  step: Step;
  /** Null while the margin needs a fix. */
  draft: Settings | null;
  live: Settings;
  onMargin: (text: string) => void;
  onStep: (step: Step) => void;
}) {
  const bad = draft === null;
  return (
    <section aria-labelledby="new-settings-title" className="rounded-2xl border bg-card px-5 py-5 shadow-card md:px-[22px]">
      <h2 id="new-settings-title" className="mb-4 font-display text-lg font-semibold tracking-tight">New settings</h2>
      <div>
        <SettingRow label="Margin" labelFor="credits-margin">
          <InputGroup className="w-[120px]">
            <InputGroupInput
              id="credits-margin"
              value={margin}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={bad || undefined}
              aria-describedby="credits-margin-why"
              onChange={(e) => onMargin(e.target.value)}
            />
            <InputGroupAddon align="inline-end" aria-hidden className="text-xs text-muted-foreground">%</InputGroupAddon>
          </InputGroup>
          <p id="credits-margin-why" className={cn("text-xs", bad ? "text-destructive-text" : "text-muted-foreground")}>
            {bad ? MARGIN_ERROR : MARGIN_HINT}
          </p>
        </SettingRow>
        <SettingRow label="Rounding step">
          <RadioGroup
            aria-label="Rounding step"
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
          <p className="text-xs text-muted-foreground">
            Each run rounds up to a whole number of steps. A bigger step gives rounder numbers and more rounding on cheap runs.
          </p>
        </SettingRow>
        <LockedSettings />
      </div>
      <h3 className="mt-6 mb-3 text-sm font-semibold">Worked example</h3>
      <WorkedExample settings={draft ?? live} live={draft ? live : undefined} />
    </section>
  );
}
