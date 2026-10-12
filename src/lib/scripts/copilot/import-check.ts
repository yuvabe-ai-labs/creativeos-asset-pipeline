import type { ScriptDoc } from "../schema";

// Paste-a-script spec §4.1 and §4.4: only formatting is removed from a paste, and afterwards every
// shot's VO and on-screen text must still be found in the pasted text, so "word for word" is
// checked, not trusted. Spacing and quote style are ignored; wording, case and spelling never are.

/** Markdown's formatting, not the script's words. Bold markers are dropped first, only where they
 *  are not escaped, so an escaped "\_\_\_\_" keeps its four underscores; then backslash escapes. */
export function stripFormatting(text: string): string {
  return text
    .replace(/(?<!\\)(\*\*|__)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~"])/g, "$1");
}

export function normalizeForMatch(text: string): string {
  return stripFormatting(text)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type Mismatch = { shotId: string; index: number; fields: ("vo" | "onScreenText")[] };

/** Each shot with a VO or on-screen text that is not in the paste as written. An empty field passes:
 *  a beat's later shots carry nothing (the carry rule, D327). */
export function unmatchedShots(doc: ScriptDoc, paste: string): Mismatch[] {
  const haystack = normalizeForMatch(paste);
  const found = (text: string) => {
    const n = normalizeForMatch(text);
    return n === "" || haystack.includes(n);
  };
  return doc.shots.flatMap((s, index) => {
    const fields = (["vo", "onScreenText"] as const).filter((f) => !found(s[f]));
    return fields.length > 0 ? [{ shotId: s.id, index, fields: [...fields] }] : [];
  });
}
