// PostgREST may surface an embedded to-one relation as an object or a single-element array,
// depending on schema-cache heuristics. One helper for every reader of such embeds.
export type Embed<T> = T | T[] | null;

export function unwrapEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
