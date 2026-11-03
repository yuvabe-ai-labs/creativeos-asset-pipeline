"use client";

import { VoLinesEditor } from "./vo-lines-editor";
import { useCanvasPeople } from "@/hooks/use-canvas-people";
import type { VoLine } from "@/lib/nodes/reel-script";

// D286 — lines that play over the WHOLE clip, not one shot. D472 — each line says who speaks it,
// picked from the people on the canvas, and an empty card says plainly that the clip is silent:
// the video request now tells the model exactly that, so nobody speaks a line nobody wrote.
// Its own component so the canvas scan in useCanvasPeople runs only while the focus view is open.
export function SequenceVoiceoverCard({ lines, readOnly, onChange }: {
  lines: VoLine[] | undefined;
  readOnly: boolean;
  onChange: (next: VoLine[]) => void;
}) {
  const people = useCanvasPeople();
  const empty = (lines ?? []).every((l) => !l.text.trim());
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-card">
      <span className="text-eyebrow text-muted-foreground">Voiceover · whole sequence</span>
      {empty && (
        <p className="text-xs text-muted-foreground">No lines, so nobody speaks in this clip.</p>
      )}
      <VoLinesEditor lines={lines} readOnly={readOnly} people={people} onChange={onChange} />
    </div>
  );
}
