"use client";

import type { ReactNode } from "react";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
   * D195/D211 — when set, every OTHER model is still rendered but disabled (muted, with a
   * tooltip explaining why), rather than removed from the list. A multishot plan can only
   * generate on Omni, but hiding the other chips hid the restriction along with them — the
   * operator saw a shorter list and had no idea a lock was in effect. Disabling keeps the
   * restriction visible.
   */
  lockedToModelId?: string;
  restrictionReason?: string;
  /** Settings that belong to the chosen model (resolution, duration) and share its card. */
  children?: ReactNode;
}) {
  const editable = useCanvasEditable(); // D33: false when this session is read-only

  return (
    // Flat, like the image-gen output settings: the controls are the page's work,
    // and a card around them competes with the generated video for emphasis.
    <TooltipProvider delay={200}>
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Cpu className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Model</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
          {videoGenClientModelGroups.map((providerGroup) => (
            <div key={providerGroup.label} className="flex items-center gap-2.5">
              <span className="shrink-0 text-[0.7rem] font-medium uppercase tracking-wide text-foreground/70">
                {providerGroup.label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {providerGroup.models.map((m) => {
                  const active = m.id === modelId;
                  // Locked BY THE MULTISHOT CONNECTION — gets a tooltip explaining why. A
                  // read-only session (D33) also disables every chip, but carries no tooltip:
                  // that's the standing state of the whole node, not a per-chip reason.
                  const locked = lockedToModelId !== undefined && m.id !== lockedToModelId;
                  const chip = (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={active}
                      disabled={locked || !editable}
                      onClick={() => onModelChange(m.id)}
                      className={cn(
                        "h-auto rounded-md border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors",
                        active
                          ? "border-primary/35 bg-primary/8 text-primary hover:bg-primary/8"
                          : "border-border bg-transparent text-foreground/70 hover:bg-muted hover:text-foreground",
                        locked && "opacity-40",
                      )}
                    >
                      {modelPickerLabel(m)}
                    </Button>
                  );

                  if (!locked) {
                    return <div key={m.id}>{chip}</div>;
                  }

                  // A disabled Button carries `disabled:pointer-events-none`, so a Tooltip
                  // whose trigger IS that button never sees a hover. Make the trigger a
                  // focusable/hoverable span WRAPPING the disabled chip instead — the span
                  // still receives the pointer/focus events the disabled child can't.
                  return (
                    <Tooltip key={m.id}>
                      <TooltipTrigger
                        render={<span tabIndex={0} className="inline-flex cursor-not-allowed" />}
                      >
                        {chip}
                      </TooltipTrigger>
                      <TooltipContent>{restrictionReason}</TooltipContent>
                    </Tooltip>
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
