"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { useCan } from "./use-can";

export const GENERATE_OFF_REASON = "Generating is turned off for you. Ask your agency owner.";

type Props = ComponentProps<typeof Button> & {
  need: PermissionKey;
  clientId?: string;
  /** Why the button is disabled for some other reason. The permission reason wins over it. */
  disabledReason?: string | null;
  /** The span the tooltip hangs on: a disabled button gets no pointer events. */
  triggerClassName?: string;
  tooltipSide?: "top" | "bottom";
};

// D499 §6.4, "one wrapper per pattern": a missing Generate shows the button disabled with the
// reason, so people know the feature exists and whom to ask. The reason is also in the markup
// (sr-only), since a disabled button can't be focused to reach its tooltip.
export function GatedButton({
  need,
  clientId,
  disabled = false,
  disabledReason = null,
  triggerClassName = "inline-block",
  tooltipSide = "top",
  ...props
}: Props) {
  const allowed = useCan(need, clientId);
  const reason = !allowed ? GENERATE_OFF_REASON : disabled ? disabledReason : null;
  const button = <Button {...props} disabled={!allowed || disabled} />;
  if (!reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={triggerClassName} />}>
        {button}
        <span className="sr-only">{reason}</span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="max-w-56 text-center">{reason}</TooltipContent>
    </Tooltip>
  );
}
