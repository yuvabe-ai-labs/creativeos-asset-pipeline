"use client";

import type { ReactNode } from "react";
import { Loader2, Sparkles, type LucideIcon } from "lucide-react";
import { GatedButton } from "@/components/permissions/gated-button";
import { useClientId } from "@/components/canvas/client-id-context";
import type { Action } from "@/lib/permissions/model";
import { cn } from "@/lib/utils";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

/**
 * D435 — every node's Generate / Re-generate, the same everywhere: pinned to the foot of the
 * settings column while it scrolls, full width, the node's icon, the estimate, and why it is
 * unavailable on hover. Place it LAST, as a direct child of the column's content wrapper (a sticky
 * element sticks only within its parent), give that wrapper `min-h-full` so a short column still
 * puts it at the foot (`mt-auto`), and cancel the wrapper's padding with `className` (e.g.
 * "-mx-6 -mb-5" inside "px-6 py-5"). Or place it under a scrolling area, outside it.
 */
export function GenerateFooter({
  need,
  label,
  busy,
  busyLabel = "Generating…",
  onClick,
  disabled,
  disabledReason,
  credits,
  estimating = false,
  icon: Icon = Sparkles,
  notice,
  className,
}: {
  /** The permission this button needs: Generate (spec §5). */
  need: Action;
  /** "Generate motion prompt" the first time, "Re-generate" once there is an output. */
  label: string;
  busy: boolean;
  busyLabel?: string;
  onClick: () => void;
  disabled: boolean;
  /** Shown on hover while disabled; null when the state speaks for itself. */
  disabledReason?: string | null;
  credits: number | null;
  estimating?: boolean;
  icon?: LucideIcon;
  /** A line above the button (e.g. "Generate acts on the active version"). */
  notice?: ReactNode;
  className?: string;
}) {
  const clientId = useClientId();
  return (
    <div className={cn("sticky bottom-0 z-10 mt-auto flex flex-col gap-2 border-t border-border bg-card px-6 py-3", className)}>
      {notice}
      <GatedButton
        need={need}
        clientId={clientId}
        size="lg"
        className="w-full"
        triggerClassName="block w-full"
        onClick={onClick}
        disabled={disabled}
        disabledReason={disabledReason ?? null}
      >
        {estimating ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Icon className="size-4" strokeWidth={1.5} />
        )}
        {busy ? busyLabel : label}
        {!busy && !estimating && credits !== null && <EstimatedCreditsLabel credits={credits} />}
      </GatedButton>
    </div>
  );
}
