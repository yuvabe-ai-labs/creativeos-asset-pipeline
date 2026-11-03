"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NARRATOR = "narrator";

/** "Voiceover · off-screen" for the narrator, "Asha · on camera" for a person. */
export const speakerLabel = (speaker: string) => {
  const s = speaker.trim() || NARRATOR;
  return s === NARRATOR ? "Voiceover · off-screen" : `${s} · on camera`;
};
const optionLabel = speakerLabel;

// D472 — who says a line, picked rather than typed: the narrator off-screen, or one of the people
// on this canvas on camera. A free-text box let "narrator" stand for a line the script puts in a
// person's mouth, and the model then spoke it from the person anyway. A speaker already on a line
// that is not on the canvas (a parse's own name) stays in the list, so nothing is lost.
export function VoSpeakerSelect({ value, people, onChange }: {
  value: string;
  people: readonly string[];
  onChange: (speaker: string) => void;
}) {
  const current = value.trim() || NARRATOR;
  const options = [NARRATOR, ...new Set([...people, current].filter((p) => p && p !== NARRATOR))];
  return (
    <Select value={current} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger size="sm" aria-label="Who says this line" className="nodrag h-7 w-fit gap-1.5 border-dashed px-2 text-xs">
        <SelectValue>{optionLabel(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">{optionLabel(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
