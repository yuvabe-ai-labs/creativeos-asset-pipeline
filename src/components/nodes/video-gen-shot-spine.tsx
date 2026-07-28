"use client";

import { ArrowRight, Image as ImageIcon, Layers, Plus, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ShotSpineModel, ShotSpineSlot } from "@/lib/video-gen/shot-spine";

const FILLED_ICON = {
  start_frame: ImageIcon,
  end_frame: ImageIcon,
  reference: Layers,
} as const;

/**
 * One slot in the spine. Non-interactive by design — roles are assigned from the connected-images
 * list, and the only action here is "Create end frame". An empty slot still carries the dashed
 * primary treatment so it reads as an invitation rather than as something broken.
 */
function Slot({ slot }: { slot: ShotSpineSlot }) {
  const Icon = slot.state === "empty" ? Plus : FILLED_ICON[slot.role];

  return (
    <div className="flex min-w-16 flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-xl transition-colors duration-200",
          slot.state === "filled" && "border border-border bg-muted",
          slot.state === "empty" && "border border-dashed border-primary/40 bg-primary/[0.03]",
          slot.state === "unsupported" && "border border-dashed border-border/50",
        )}
      >
        <Icon
          className={cn(
            "size-4",
            slot.state === "filled" && "text-foreground",
            slot.state === "empty" && "text-primary",
            slot.state === "unsupported" && "text-muted-foreground/25",
          )}
          strokeWidth={1.5}
        />
      </div>

      <span
        className={cn(
          "text-eyebrow",
          slot.state === "unsupported" && "text-muted-foreground/40",
        )}
      >
        {slot.label}
      </span>

      {slot.detail && (
        <span className="text-[0.65rem] leading-none text-muted-foreground">{slot.detail}</span>
      )}
      {slot.state === "unsupported" && (
        <span className="text-[0.65rem] leading-none text-muted-foreground/50">
          Not on this model
        </span>
      )}
    </div>
  );
}

/**
 * D83 — the shot spine. Start → End → Reference in narrative order, with the duration the
 * current combination yields. Never gates generation; the preference for a start+end pair is
 * expressed entirely by showing the empty slot at rest.
 */
export function VideoGenShotSpine({
  model,
  onCreateEndFrame,
  creatingEndFrame = false,
}: {
  model: ShotSpineModel;
  onCreateEndFrame?: () => void;
  creatingEndFrame?: boolean;
}) {
  const [start, end, reference] = model.slots;
  const canDerive =
    Boolean(onCreateEndFrame) && start.state === "filled" && end.state === "empty";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
        <span className="text-eyebrow">The shot</span>
      </div>

      <div className="flex items-start gap-3">
        <Slot slot={start} />
        <ArrowRight className="mt-5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <Slot slot={end} />
        <div className="mx-1 mt-5 h-6 w-px shrink-0 bg-border" />
        <Slot slot={reference} />
      </div>

      {canDerive && (
        <Button
          variant="outline"
          size="sm"
          disabled={creatingEndFrame}
          onClick={onCreateEndFrame}
          className="mt-4 w-full border-dashed border-primary/40 text-primary hover:bg-primary/5"
        >
          <Plus strokeWidth={1.5} />
          {creatingEndFrame ? "Creating…" : "Create end frame"}
        </Button>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3.5" strokeWidth={1.5} />
        Duration · {model.durationLabel}
      </p>
    </div>
  );
}
