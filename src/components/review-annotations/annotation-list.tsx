"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
export function AnnotationList({
  groups,
  readOnly,
  onSeek,
  onRemove,
}: {
  groups: { timecodeMs: number | null; items: AnnotationListItem[] }[];
  readOnly: boolean;
  onSeek?: (timecodeMs: number) => void;
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
            {g.items.map((item) => (
              <div key={item.seq} className="mt-1 flex items-start gap-1.5 first:mt-0">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {item.seq}
                </span>
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {item.note}
                </p>
                {!readOnly && onRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRemove(item.seq)}
                    className="size-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove annotation ${item.seq}`}
                  >
                    <Trash2 className="size-3" strokeWidth={1.5} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
