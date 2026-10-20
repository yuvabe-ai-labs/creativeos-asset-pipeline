"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/editor/timeline";
import type { SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

/** One connected source (mockup "Sources"): a swatch, its handle and what it is, and a dashed
 *  chip to put it on the timeline again. No media loads here (performance rule 1). */
export function EditorSourceRow({ source, tone, editable, onAdd }: { source: SourceView; tone: string; editable: boolean; onAdd(): void }) {
  const video = source.files.original.facts?.video;
  const shot = source.shotLabel ?? "No shot";
  const meta = !video
    ? "Couldn't read this clip."
    : source.kind === "dubbing"
      ? [shot, source.files.dubAudio && "dubbed", source.files.lipSynced && "lip-synced"].filter(Boolean).join(" · ")
      : `${shot} · ${formatTime(video.frames / video.fps)}`;

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-border p-2">
      <div aria-hidden="true" className={cn("h-[54px] w-[34px] flex-none rounded-md", tone)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{source.handle}</span>
        <span className={cn("truncate text-xs", video ? "text-muted-foreground" : "text-destructive")}>{meta}</span>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Add ${source.handle} to the timeline again`}
        disabled={!editable || !video}
        onClick={onAdd}
        className="size-[30px] flex-none border-dashed border-primary/40 text-primary hover:bg-primary/5"
      >
        <Plus className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
