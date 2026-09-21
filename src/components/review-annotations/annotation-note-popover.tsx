"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RegionBounds } from "@/lib/review-annotations/payload";

// Card width, in one place: the horizontal clamp below has to know it.
const CARD_W = "14rem"; // w-56
const HALF_CARD_W = "7rem";
const EDGE = "0.5rem"; // breathing room from the media's edge

// Anchored note card (D243). This is a positioned card, not a Popover primitive — it
// anchors to painted pixels, not to a trigger element.
//
// It lives INSIDE the media's overflow-hidden frame, so anything that escapes is clipped
// rather than merely overflowing (D251). Staying inside is therefore not cosmetic, and
// fraction math cannot do it: the card is a fixed 224px while the frame's width varies
// with the image's aspect and the panel size, so "never past 62%" is wrong at every size
// but one.
//
// So: CSS clamp() does the horizontal work in the browser's own layout units, mixing the
// region's percentage with the card's rem width — correct at any container size, no
// measurement, no layout effect. Vertically the card FLIPS above the region when the
// region sits low, which is what a popover would do anyway.
export function AnnotationNotePopover({
  bounds,
  mode,
  seq,
  note = "",
  authorLine = null,
  onCommit,
  onCancel,
}: {
  bounds: RegionBounds;
  mode: "compose" | "read";
  seq: number;
  note?: string;
  authorLine?: string | null; // e.g. "Asha · 2h ago"
  onCommit?: (note: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(note);

  // Centre on the region, then clamp both edges inside the frame.
  const centreX = (bounds.x + bounds.w / 2) * 100;
  const left = `clamp(${EDGE}, calc(${centreX}% - ${HALF_CARD_W}), calc(100% - ${CARD_W} - ${EDGE}))`;

  // Flip above once the region's bottom passes 55% — below that there is not reliably
  // room beneath it, and a clamped-to-the-floor card would cover its own region.
  const flipAbove = bounds.y + bounds.h > 0.55;
  const vertical = flipAbove
    ? { bottom: `calc(${(1 - bounds.y) * 100}% + ${EDGE})` }
    : { top: `calc(${(bounds.y + bounds.h) * 100}% + ${EDGE})` };

  return (
    <div
      className="absolute z-20 w-56 rounded-lg border border-border bg-background p-2.5 shadow-lg"
      style={{ left, ...vertical }}
    >
      <p className="text-eyebrow mb-1.5">Annotation {seq}</p>
      {mode === "compose" ? (
        <>
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What needs to change here?"
            rows={2}
            className="resize-none text-xs leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
              <X className="size-3" strokeWidth={1.5} />
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={!draft.trim()}
              onClick={() => onCommit?.(draft.trim())}
            >
              <Check className="size-3" strokeWidth={1.5} />
              Add note
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* A long note scrolls inside the card rather than growing it past the frame,
              which the flip alone cannot prevent. */}
          <p className="max-h-40 overflow-y-auto text-xs leading-relaxed text-foreground">
            {note}
          </p>
          {authorLine && (
            <p className="mt-1 text-[10px] text-muted-foreground">{authorLine}</p>
          )}
        </>
      )}
    </div>
  );
}
