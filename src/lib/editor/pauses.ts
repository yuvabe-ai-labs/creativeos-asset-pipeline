// Pauses in speech, from a stored transcript (D409): the gaps between words long enough to be dead
// air an editor may want to cut. Seconds of the file. Pure.
import type { TranscriptWord } from "@/lib/transcribe/types";

export const MIN_PAUSE_SECONDS = 0.6;

export function pausesFromWords(words: TranscriptWord[], min = MIN_PAUSE_SECONDS): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1].e;
    const b = words[i].s;
    if (b - a >= min - 1e-9) out.push([a, b]);
  }
  return out;
}
