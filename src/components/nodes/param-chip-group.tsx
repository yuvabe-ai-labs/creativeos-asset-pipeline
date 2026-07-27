"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChipOption = { value: string; label: string };

type Props = {
  options: ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  columns?: number; // set → equal-width CSS grid with N columns; unset → flex-wrap
};

// A single-select segmented control rendered as chips. Built on the shadcn
// `Button` primitive (outline variant) so it inherits the design-system focus
// ring, sizing, and motion. The active chip picks up the brand purple sparingly
// — a thin `primary/50` border, faint `primary/5` fill, and a check glyph.
export function ParamChipGroup({
  options,
  value,
  onValueChange,
  disabled,
  className,
  columns,
}: Props) {
  return (
    <div
      className={cn(columns ? "grid gap-1.5" : "flex flex-wrap gap-1.5", className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "nodrag",
              columns && "w-full justify-center px-2",
              active &&
                "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            {active && <Check className="size-3.5 shrink-0" strokeWidth={2} />}
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
