"use client";

import { AudioLines, Check, Loader2, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  /** "Female", "Male", or what the presenter option is. */
  meta: string;
  selected: boolean;
  /** No preview for the presenter's own voice: it is the take itself. */
  canPreview: boolean;
  playing: boolean;
  loading: boolean;
  onPreview: () => void;
  onSelect: () => void;
};

// D379 — one voice in the Dubbing voice picker, like the Change voice picker's rows: a round play
// button, the name and its gender, and "Use" on hover/focus, or "Selected" for the chosen voice.
export function DubbingVoiceRow({ name, meta, selected, canPreview, playing, loading, onPreview, onSelect }: Props) {
  return (
    <div className={cn("group flex h-14 items-center gap-3 rounded-lg px-2", selected ? "bg-primary/5" : "hover:bg-muted")}>
      {canPreview ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="nodrag shrink-0 rounded-full"
          aria-label={`${playing ? "Stop" : "Play"} preview of ${name}`}
          disabled={loading}
          onClick={onPreview}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          ) : playing ? (
            <AudioLines className="size-4 text-primary motion-safe:animate-pulse" strokeWidth={1.5} />
          ) : (
            <Play className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
          <UserRound className="size-4" strokeWidth={1.5} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="flex w-24 shrink-0 justify-end">
        {selected ? (
          <span className="flex items-center gap-1 text-sm font-medium text-primary">
            <Check className="size-4" strokeWidth={1.5} /> Selected
          </span>
        ) : (
          <Button type="button" size="sm" className="nodrag opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={onSelect}>
            Use
          </Button>
        )}
      </span>
    </div>
  );
}
