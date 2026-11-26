"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddChip } from "@/components/admin/models/add-chip";

/**
 * The model page's one primary action: opens the change-prices flow. Without `onStart` it is shown
 * disabled, with a tooltip.
 */
export function ChangePricesButton({ hasPrices, onStart }: { hasPrices: boolean; onStart?: () => void }) {
  const label = hasPrices ? "Change prices" : "Add prices";
  const button = (
    <Button id="change-prices-start" disabled={!onStart} onClick={onStart}>
      <Pencil aria-hidden strokeWidth={1.5} />
      {label}
    </Button>
  );
  if (onStart) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>{button}</TooltipTrigger>
      <TooltipContent>Changing prices here isn&apos;t ready yet.</TooltipContent>
    </Tooltip>
  );
}

/** The empty sheet's dashed "Add prices" chip; the same action as the header button. */
export function AddPricesChip({ onStart }: { onStart?: () => void }) {
  return <AddChip label="Add prices" disabled={!onStart} onClick={onStart} className="self-center" />;
}
