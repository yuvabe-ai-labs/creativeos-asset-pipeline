"use client";

import { VoLinesEditor } from "./vo-lines-editor";
import { useCanvasPeople } from "@/hooks/use-canvas-people";
import { secondsToSay, SPEECH_ROOM_SECONDS } from "@/lib/nodes/voiceover";
import type { VoLine } from "@/lib/nodes/reel-script";

// D286 — lines that play over the WHOLE clip, not one shot. D472 — each line says who speaks it,
// picked from the people on the canvas, and an empty card says plainly that the clip is silent:
// the video request now tells the model exactly that, so nobody speaks a line nobody wrote.
// Its own component so the canvas scan in useCanvasPeople runs only while the focus view is open.
export function SequenceVoiceoverCard({ nodeId, lines, clipSeconds, readOnly, onChange }: {
  /** The Multishot node: its script's speakers join the list (D476). */
  nodeId: string;
  lines: VoLine[] | undefined;
  /** The clip's length, the cuts added up. */
  clipSeconds: number;
  readOnly: boolean;
  onChange: (next: VoLine[]) => void;
}) {
  const people = useCanvasPeople(nodeId);
  const empty = (lines ?? []).every((l) => !l.text.trim());
  // D474 — lines longer than the clip are cut off at its end, so say so before it is generated.
  const needed = secondsToSay(lines);
  const tooLong = needed > 0 && needed + SPEECH_ROOM_SECONDS > clipSeconds;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-card">
      <span className="text-eyebrow text-muted-foreground">Voiceover · whole sequence</span>
      {empty && (
        <p className="text-xs text-muted-foreground">No lines, so nobody speaks in this clip.</p>
      )}
      <VoLinesEditor lines={lines} readOnly={readOnly} people={people} onChange={onChange} />
      {tooLong && (
        <p className="text-xs text-destructive">
          These lines take about {needed}s to say, and this clip is {clipSeconds}s. Shorten them or
          lengthen the cuts, or the end will be cut off.
        </p>
      )}
    </div>
  );
}
