import type { BenchSettings } from "./constants";

// Settings ride as --flags in the prompt. NOTE: this is the vendor's *legacy* method (invalid
// values are silently ignored); request-body fields are the recommended one — see
// docs/superpowers/specs/2026-09-22-seedream-seedance-handoff.md §3.2. Kept for the bench.
//
// With a voice anchor, the prompt binds each input by upload order, as the Seedance 2.5
// prompt guide asks: @Image 1 is the face, @Audio 1 is the voice — timbre only, so the
// anchor clip's music and sound effects aren't copied into every video.
export function buildSeedancePrompt(
  script: string,
  s: BenchSettings,
  voice?: { note: string },
): string {
  const lead = voice
    ? "Use the person in @Image 1 as the creator. Reference only the voice timbre in @Audio 1 " +
      "(not its music or sound effects). " +
      (voice.note.trim() ? `Voice: ${voice.note.trim()}. ` : "")
    : "";
  const flags = [
    `--resolution ${s.resolution}`,
    `--duration ${s.duration}`,
    `--ratio ${s.ratio}`,
    `--watermark false`,
  ].join(" ");
  return `${lead}${script.trim()} ${flags}`;
}
