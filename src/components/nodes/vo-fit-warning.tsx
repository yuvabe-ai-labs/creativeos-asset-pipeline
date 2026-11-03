"use client";

import { secondsToSay, SPEECH_ROOM_SECONDS } from "@/lib/nodes/voiceover";
import type { VoLine } from "@/lib/nodes/reel-script";

// D474 — lines longer than the clip are cut off at its end, so say so before it is generated.
// D478 — shared by the Multishot's voiceover card and a single shot's row in the Script.
export function VoFitWarning({ lines, seconds, fix }: {
  lines: VoLine[] | undefined;
  /** The clip's length in seconds. */
  seconds: number;
  /** What to lengthen, in the words of the surface: "the cuts", "the shot". */
  fix: string;
}) {
  const needed = secondsToSay(lines);
  if (needed === 0 || needed + SPEECH_ROOM_SECONDS <= seconds) return null;
  const many = (lines ?? []).filter((l) => l.text.trim()).length > 1;
  return (
    <p className="text-xs text-destructive">
      {many ? "These lines take" : "This line takes"} about {needed}s to say, and this clip is {seconds}s.
      Shorten {many ? "them" : "it"} or lengthen {fix}, or the end will be cut off.
    </p>
  );
}
