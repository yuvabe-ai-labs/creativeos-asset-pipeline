"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RegionBounds } from "@/lib/review-annotations/draft";

// Anchored note card (D213). Positioned just below the region's bounding box and
// clamped so it never leaves the media container. This is a positioned card, not a
// Popover primitive — it anchors to painted pixels, not to a trigger element.
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
  // Below the region; clamp: never past 62% left (the card is ~w-56) or 80% top, so it
  // stays inside the media box no matter where the senior painted.
  const left = Math.min(bounds.x, 0.62);
  const top = Math.min(bounds.y + bounds.h + 0.02, 0.8);
  return (
    <div
      className="absolute z-20 w-56 rounded-lg border border-border bg-background p-2.5 shadow-lg"
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
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
          <p className="text-xs leading-relaxed text-foreground">{note}</p>
          {authorLine && (
            <p className="mt-1 text-[10px] text-muted-foreground">{authorLine}</p>
          )}
        </>
      )}
    </div>
  );
}
