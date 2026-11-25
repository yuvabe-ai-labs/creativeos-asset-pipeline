"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type Choice<T extends string> = { value: T; title: string; detail: string };

/** A short list of options as radio cards: the chooser's two starting points, When's Now / On a date. Arrow keys move. */
export function ChoiceCards<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <RadioGroup aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} className="gap-2.5">
      {choices.map((c) => (
        <label
          key={c.value}
          className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200 hover:bg-muted/50 has-data-checked:border-primary/50 has-data-checked:bg-primary/5"
        >
          <RadioGroupItem value={c.value} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{c.title}</span>
            <span className="text-[0.8125rem] text-muted-foreground">{c.detail}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
