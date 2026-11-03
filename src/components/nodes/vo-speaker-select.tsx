"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NARRATOR = "narrator";
const SOMEONE_ELSE = "__someone-else__";

/** "Voiceover · off-screen" for the narrator, "Asha · on camera" for a person. */
export const speakerLabel = (speaker: string) => {
  const s = speaker.trim() || NARRATOR;
  return s === NARRATOR ? "Voiceover · off-screen" : `${s} · on camera`;
};
const optionLabel = (o: string) => (o === SOMEONE_ELSE ? "Someone else…" : speakerLabel(o));

// D472 — who says a line, picked rather than typed: the narrator off-screen, or one of the people
// on this canvas on camera. A free-text box let "narrator" stand for a line the script puts in a
// person's mouth, and the model then spoke it from the person anyway. A speaker already on a line
// that is not on the canvas (a parse's own name) stays in the list, so nothing is lost.
// D476 — "Someone else…" types a name the list does not have yet (a character introduced later).
export function VoSpeakerSelect({ value, people, onChange }: {
  value: string;
  people: readonly string[];
  onChange: (speaker: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const current = value.trim() || NARRATOR;
  const options = [NARRATOR, ...new Set([...people, current].filter((p) => p && p !== NARRATOR)), SOMEONE_ELSE];

  if (typing) {
    const commit = () => {
      setTyping(false);
      if (name.trim()) onChange(name.trim());
    };
    return (
      <Input
        autoFocus
        value={name}
        placeholder="Their name, then Enter"
        aria-label="Who says this line"
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { e.stopPropagation(); setTyping(false); }
        }}
        className="nodrag h-7 w-48 px-2 text-xs"
      />
    );
  }

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        if (v === SOMEONE_ELSE) { setName(""); setTyping(true); return; }
        if (v) onChange(v);
      }}
    >
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
