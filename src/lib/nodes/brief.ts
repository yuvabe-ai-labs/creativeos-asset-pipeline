// The Brief node's `compile` step — a pure function: (source + client context)
// → the exact model payload. No side effects, no secrets. (Later this is also
// what renders as the visible "final compiled prompt".)

// Default extraction schema (the fields we pull out of a brief). Editing this
// per-node is a later-stage feature; Stage 1 ships this default.
export const BRIEF_FIELDS = [
  "objective",
  "audience",
  "deliverables",
  "tone",
  "key_messages",
  "constraints",
  "timeline",
] as const;

const SYSTEM = `You parse a creative brief into structured JSON.
Extract exactly these keys:
- objective (string)
- audience (string)
- deliverables (string[])
- tone (string)
- key_messages (string[])
- constraints (string)
- timeline (string)
If a field is not present in the brief, use an empty string or empty array.
Respond with ONLY a JSON object containing exactly those keys.`;

export function compileBrief(source: string, clientContext: string) {
  const ctx = clientContext.trim()
    ? `Client context (use it to disambiguate, do not invent facts):\n${clientContext.trim()}\n\n`
    : "";
  const user = `${ctx}Brief to parse:\n${source.trim()}`;
  return { system: SYSTEM, user };
}
