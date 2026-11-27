"use client";

import { Button } from "@/components/ui/button";

export type CreditLimitMode = "unlimited" | "set";

// The Unlimited / Set limit choice for an agency's monthly credit limit: one unambiguous default,
// and an amount box only once Set limit is chosen. Used by the agency page's CreditLimitEditor.
export function CreditLimitToggle({
  mode,
  disabled,
  onUnlimited,
  onSet,
}: {
  mode: CreditLimitMode;
  disabled?: boolean;
  onUnlimited: () => void;
  onSet: () => void;
}) {
  return (
    <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
      <Button
        type="button"
        size="sm"
        variant={mode === "unlimited" ? "default" : "ghost"}
        aria-pressed={mode === "unlimited"}
        disabled={disabled}
        onClick={onUnlimited}
      >
        Unlimited
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "set" ? "default" : "ghost"}
        aria-pressed={mode === "set"}
        disabled={disabled}
        onClick={onSet}
      >
        Set limit
      </Button>
    </div>
  );
}
