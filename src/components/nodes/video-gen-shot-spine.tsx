"use client";

import { ArrowRight, Check, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ShotSpineModel, ShotSpineSlot } from "@/lib/video-gen/shot-spine";

/**
 * One slot in the spine. Non-interactive by design — roles are assigned from the thumbnails
 * below, and the spine only reports.
 *
 * Laid out horizontally (pip beside label, not stacked above it) so all three slots and the
 * duration fit on one row. The label carries the role, which frees the pip to carry only STATE.
 *
 * An empty slot is deliberately NOT the dashed-primary + plus treatment. That combination is this
 * codebase's signature for an "Add" affordance (see AGENTS.md, editable-field.tsx), so wearing it
 * here made a read-only summary look like a button. These are status pips: absence is reported,
 * not offered.
 */
function Slot({ slot }: { slot: ShotSpineSlot }) {
  const filled = slot.state === "filled";
  const empty = slot.state === "empty";

  return (
    <div className="flex min-w-0 select-none items-center gap-2">
      {/* A circle, not a rounded square: round pips read as status, squares read as buttons.
          Empty carries no glyph — any mark inside an outline invites a click, and there is
          nothing to click here. */}
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
          filled && "border border-success/40 bg-success/15",
          empty && "border border-border bg-muted",
          slot.state === "unsupported" && "border border-dashed border-border/50 bg-transparent",
        )}
      >
        {/* text-success-text, not text-success: the raw 500 is 2.03:1 on this white card. */}
        {filled && <Check className="size-3.5 text-success-text" strokeWidth={2.5} />}
      </div>

      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "text-eyebrow whitespace-nowrap",
            slot.state === "unsupported" && "text-muted-foreground/40",
          )}
        >
          {slot.label}
        </span>
        {slot.detail && (
          <span className="whitespace-nowrap text-[0.65rem] text-muted-foreground">
            {slot.detail}
          </span>
        )}
        {slot.state === "unsupported" && (
          <span className="whitespace-nowrap text-[0.65rem] text-muted-foreground/50">
            not on this model
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * D95 — the shot spine. Start → End → Reference in narrative order, with the duration the
 * current combination yields. Never gates generation; the preference for a start+end pair is
 * expressed entirely by showing the empty slot at rest.
 */
export function VideoGenShotSpine({ model }: { model: ShotSpineModel }) {
  const [start, end, reference] = model.slots;

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
      {/* Duration rides in the header rather than on its own line below the slots — it is
          metadata about the shot, and giving it a row of its own doubled the card's height. */}
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">The shot</span>
        </div>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <Timer className="size-3.5" strokeWidth={1.5} />
          {model.durationLabel}
          {/* A pinned duration looks identical to a freely-chosen one, so it gets a marker at
              the value itself. The full rule text is a sentence — too long to sit in a header
              beside a two-character value — so it lives in the tooltip. */}
          {model.durationLockReason && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label={model.durationLockReason}
                    className="cursor-default rounded bg-info/12 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-info-text"
                  />
                }
              >
                Fixed
              </TooltipTrigger>
              <TooltipContent side="bottom">{model.durationLockReason}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Slot slot={start} />
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <Slot slot={end} />

        {/* A bare divider between the frames and the reference reads as "and also" — three slots
            in a row look like three things you fill in. When the model forbids the combination
            the separator has to carry the choice, so it says so. */}
        {model.framesRefsExclusive ? (
          <span className="mx-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
            or
          </span>
        ) : (
          <div className="mx-1 h-5 w-px shrink-0 bg-border" />
        )}

        <Slot slot={reference} />
      </div>

      {model.framesRefsExclusive && (
        <p className="mt-2.5 text-[0.7rem] leading-snug text-muted-foreground">
          Only start + end <span className="font-medium">or</span> ref can be selected, not both.
        </p>
      )}
      </div>
    </TooltipProvider>
  );
}
