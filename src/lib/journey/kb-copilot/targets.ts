// What the brand KB copilot can work on, named as targets (the page shows the copilot's work, D508).
// A page tags each element with its target (`data-copilot-target`), and the copilot reports
// "working on X" by the same id, so any page that tags it gets the follow, the mark and the landing.
// Pure: server and browser.

export const kbTarget = {
  /** A review field, by its dotted path ("target_audience.age_range"). */
  field: (path: string) => `kb:${path}`,
  /** A field of the form before a build. */
  form: (name: "website" | "instagram" | "facebook") => `kb-form:${name}`,
  /** A source: a document or image id. */
  source: (id: string) => `kb-source:${id}`,
};

const FIELD = "kb:";

/** The review path of a `kb:` target, else null. */
export function kbFieldPath(target: string): string | null {
  return target.startsWith(FIELD) ? target.slice(FIELD.length) : null;
}
