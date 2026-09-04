"use client";

import type { ReactNode } from "react";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  videoGenClientModelGroups,
  modelPickerLabel,
} from "@/lib/video-gen/client-models";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";

/**
 * The model picker, lifted out of the params panel and up above the shot spine.
 *
 * It sits first because it governs everything under it — which frame roles exist, which params
 * are shown, which combinations are legal, what the shot costs. Buried in "Output settings" it
 * read as one setting among many, when in fact changing it re-shapes the whole panel.
 *
 * Compact by design: provider name inline with its chips on one wrapping row, rather than a
 * heading and a 3-column grid per provider. The provider prefix is stripped from each label
 * (see modelPickerLabel) so the chips show only what differs.
 */
export function VideoGenModelPicker({
  modelId,
  onModelChange,
  lockedToModelId,
  restrictionReason,
  children,
}: {
  modelId: string;
  onModelChange: (modelId: string) => void;
  /**
   * D216/D232 — when set, ONLY this model is offered; every other chip is removed from the list.
   *
   * A multishot plan can only generate on Omni, so the others are not choices. They were briefly
   * rendered-but-disabled so the lock would be visible, but a row of dead chips is clutter on a
   * decision that has already been made — `restrictionReason` below carries the explanation
   * instead, which is what keeps the restriction from being silent.
   *
   * NOTE this is display only. The constraint is ENFORCED by coercing the node's stored `modelId`
   * on connect (canvas-store's onConnect); filtering a picker is not enforcing anything, and a
   * previous version of this restriction shipped exactly that mistake.
   */
  lockedToModelId?: string;
  restrictionReason?: string;
  /** Settings that belong to the chosen model (resolution, duration) and share its card. */
  children?: ReactNode;
}) {
  const editable = useCanvasEditable(); // D33: false when this session is read-only

  // Drop the models this node cannot use, and any provider group left with none.
  const shownGroups =
    lockedToModelId === undefined
      ? videoGenClientModelGroups
      : videoGenClientModelGroups
          .map((g) => ({ ...g, models: g.models.filter((m) => m.id === lockedToModelId) }))
          .filter((g) => g.models.length > 0);

  return (
    // Flat, like the image-gen output settings: the controls are the page's work,
    // and a card around them competes with the generated video for emphasis.
    // The provider is here for `children` — the model's own settings render inside this card and
    // may carry tooltips. The picker itself no longer has any: the tooltip existed to explain a
    // disabled chip, and unusable models are not rendered at all now.
    <TooltipProvider delay={200}>
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Cpu className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Model</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
          {shownGroups.map((providerGroup) => (
            <div key={providerGroup.label} className="flex items-center gap-2.5">
              <span className="shrink-0 text-[0.7rem] font-medium uppercase tracking-wide text-foreground/70">
                {providerGroup.label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {providerGroup.models.map((m) => {
                  const active = m.id === modelId;
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={active}
                      disabled={!editable} // D33 only — unusable models are no longer rendered
                      onClick={() => onModelChange(m.id)}
                      className={cn(
                        "h-auto rounded-md border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors",
                        active
                          ? "border-primary/35 bg-primary/8 text-primary hover:bg-primary/8"
                          : "border-border bg-transparent text-foreground/70 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {modelPickerLabel(m)}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {restrictionReason && (
          <p className="mt-2 text-[0.7rem] text-muted-foreground">{restrictionReason}</p>
        )}

        {children && (
          <>
            <div className="my-4 h-px bg-border" />
            {children}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
