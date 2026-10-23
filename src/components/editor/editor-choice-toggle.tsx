"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The mockup's segmented control: two or more options, one chosen, some possibly unavailable. */
export function EditorChoiceToggle<T extends string>({ label, value, options, disabled, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; available: boolean }>;
  disabled?: boolean;
  onChange(next: T): void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v: string[]) => v[0] && v[0] !== value && onChange(v[0] as T)}
      disabled={disabled}
      spacing={0}
      className="w-full rounded-[9px] bg-muted p-[3px]"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          disabled={!o.available}
          className="h-[30px] flex-1 rounded-[7px] text-[13px] data-[pressed]:bg-card data-[pressed]:font-semibold data-[pressed]:shadow-sm"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
