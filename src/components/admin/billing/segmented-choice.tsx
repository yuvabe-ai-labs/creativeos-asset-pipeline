"use client";

import { Button } from "@/components/ui/button";

// A two-or-more way choice drawn like the credit limit's Unlimited / Set limit toggle
// (credit-limit-toggle.tsx), for billing and free credits.
export function SegmentedChoice<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "ghost"}
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
