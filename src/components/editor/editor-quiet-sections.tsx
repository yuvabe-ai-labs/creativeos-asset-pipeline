"use client";

import { Button } from "@/components/ui/button";
import { useQuietWindows } from "@/hooks/queries/editor";
import { quietSections } from "@/lib/editor/silence";
import { formatTime } from "@/lib/editor/timeline";
import type { Piece } from "@/lib/editor/types";

/** Quiet stretches in a piece, for review only (spec §6): nothing is cut automatically. The file is
 *  read once per session through the same-origin proxy, when a piece of it is first selected. */
export function EditorQuietSections({ piece, soundUrl, onSeekSource }: { piece: Piece; soundUrl: string | null; onSeekSource(sourceSeconds: number): void }) {
  const { data, isPending, isError } = useQuietWindows(soundUrl);
  const sections = data ? quietSections(data, piece.in, piece.out) : [];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">Quiet sections</span>
      {isError ? (
        <span className="text-xs text-muted-foreground">Couldn&apos;t read this clip&apos;s sound.</span>
      ) : isPending ? (
        <span className="text-xs text-muted-foreground">Listening…</span>
      ) : sections.length === 0 ? (
        <span className="text-xs text-muted-foreground">No quiet stretches in this piece.</span>
      ) : (
        sections.map(([start, end]) => (
          <div key={start} className="flex items-center justify-between text-[13px] tabular-nums text-foreground/80">
            <span>{formatTime(start)} – {formatTime(end)}</span>
            <Button variant="outline" size="sm" className="h-[26px] px-2.5 text-xs" onClick={() => onSeekSource(start)}>
              Seek
            </Button>
          </div>
        ))
      )}
      <span className="text-xs text-muted-foreground">Shown for review. Nothing is cut automatically.</span>
    </div>
  );
}
