"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnnotationListItem = {
  seq: number;
  note: string;
  timecodeMs: number | null;
};

export function formatTimecode(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The Review-column index of a decision's annotations (D213): flat for images,
// timecode-grouped for video. Compose mode shows a remove control per row.
//
// D220: when `onSelect` is given the whole row is the control — click it and the note
// opens on the media (video also seeks there first). The list is the reliable target;
// a pin is a 20px circle sitting on top of the artwork, so it is an accelerator, never
// the only way in. Both surfaces behave identically.
export function AnnotationList({
  groups,
  readOnly,
  activeSeq = null,
  onSeek,
  onSelect,
  onRemove,
}: {
  groups: { timecodeMs: number | null; items: AnnotationListItem[] }[];
  readOnly: boolean;
  activeSeq?: number | null;
  onSeek?: (timecodeMs: number) => void;
  onSelect?: (item: AnnotationListItem) => void;
  onRemove?: (seq: number) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-3 min-w-0">
      <span className="text-eyebrow">Annotations</span>
      {groups.map((g) => (
        <div key={g.timecodeMs ?? "image"} className="mt-2 flex gap-2.5">
          {g.timecodeMs !== null && (
            <div className="shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onSeek?.(g.timecodeMs as number)}
                className="rounded-full bg-primary/10 px-2 font-semibold text-primary hover:bg-primary/15"
              >
                {formatTimecode(g.timecodeMs)}
              </Button>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {g.items.map((item) => {
              const active = activeSeq === item.seq;
              const body = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                      "bg-primary text-[9px] font-bold text-primary-foreground",
                      "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      active && "scale-110 ring-2 ring-primary/40",
                    )}
                  >
                    {item.seq}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                    {item.note}
                  </span>
                </>
              );
              return (
                <div key={item.seq} className="mt-1 flex items-start gap-1.5 first:mt-0">
                  {onSelect ? (
                    // A Button, never a div with onClick — it has to be focusable and
                    // keyboard-operable like any other control here. `h-auto items-start`
                    // undoes the primitive's fixed height so a long note can wrap.
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSelect(item)}
                      aria-pressed={active}
                      className={cn(
                        "h-auto min-w-0 flex-1 items-start justify-start gap-1.5",
                        "whitespace-normal px-1.5 py-1 text-left font-normal",
                        "hover:bg-primary/5",
                        active && "bg-primary/10 hover:bg-primary/10",
                      )}
                    >
                      {body}
                    </Button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-1.5 px-1.5 py-1">
                      {body}
                    </div>
                  )}
                  {!readOnly && onRemove && (
                    // Sibling of the row control, never nested inside it: a button inside
                    // a button is invalid, and the click would resolve ambiguously.
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onRemove(item.seq)}
                      className="mt-1 size-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove annotation ${item.seq}`}
                    >
                      <Trash2 className="size-3" strokeWidth={1.5} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
