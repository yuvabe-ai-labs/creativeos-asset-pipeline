// Normalize a user-entered node title before persisting. Titles are single-line,
// so we collapse any internal whitespace (including pasted newlines/tabs) to single
// spaces, trim the ends, and cap the length so an errant paste can't produce an
// absurdly long title. A blank input normalizes to "" — which every node renders
// as its own muted placeholder ("Image prompt", "Untitled file", …).
export const MAX_TITLE_LENGTH = 120;

export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH).trim();
}

// The auto-title a File node gets from its attachment: extension off, separators read as
// spaces ("hero-shot.png" → "hero shot"). Only the LAST extension is dropped, so
// "archive.tar.gz" keeps its ".tar".
export function titleFromFilename(filename: string): string {
  return normalizeTitle(filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
}

/**
 * The title a File node should carry after its attachment changes — or null to leave the
 * current one alone.
 *
 * THE RULE (FIL_02/FIL_07): a title the node derived for itself follows the file; a title the
 * operator typed is theirs and survives a replace. Replacing an image with a text file used to
 * leave the image's name as the node title forever, because the derivation ran only when the
 * title was empty — true exactly once, on the first upload.
 *
 * "Derived for itself" is matched loosely: against the previous filename's derived title AND
 * against the raw filename with its extension stripped, because nodes born in the Gallery
 * Drawer are titled that second way. A strict check would read those as hand-written and leave
 * them stale — the very bug being fixed.
 */
export function nextFileNodeTitle(input: {
  currentTitle: string | undefined;
  previousFilename: string | undefined;
  nextFilename: string;
}): string | null {
  const current = normalizeTitle(input.currentTitle ?? "");
  const next = titleFromFilename(input.nextFilename);
  if (current === next) return null; // nothing to change

  if (!current) return next;
  if (!input.previousFilename) return null; // titled, but nothing to prove it was auto-derived

  const previous = input.previousFilename;
  const wasAutoDerived =
    current === titleFromFilename(previous) ||
    current === normalizeTitle(previous.replace(/\.[^.]+$/, "")) ||
    current === normalizeTitle(previous);
  return wasAutoDerived ? next : null;
}
