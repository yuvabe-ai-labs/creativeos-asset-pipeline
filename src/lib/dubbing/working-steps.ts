// What the Dubbing view says while a job runs.

export type WorkingKind = "dub" | "lipsync";

export function workingTitle(kind: WorkingKind, language: string): string {
  return kind === "dub" ? `Dubbing into ${language}` : `Lip-syncing the ${language} dub`;
}

export function workingHint(kind: WorkingKind): string {
  return kind === "dub"
    ? "The presenter's own voice, speaking the new language."
    : "Matching the presenter's mouth to the new voice.";
}
