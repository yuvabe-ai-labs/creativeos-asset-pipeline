// Normalize a user-entered node title before persisting. Titles are single-line,
// so we collapse any internal whitespace (including pasted newlines/tabs) to single
// spaces, trim the ends, and cap the length so an errant paste can't produce an
// absurdly long title. A blank input normalizes to "" — which every node renders
// as its own muted placeholder ("Image prompt", "Untitled file", …).
export const MAX_TITLE_LENGTH = 120;

export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH).trim();
}
