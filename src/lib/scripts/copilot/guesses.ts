import type { ScriptDoc } from "../schema";
import { parseFieldPath, readField } from "./fields";
import type { ScriptNotes } from "./schema";

// Paste-a-script spec §4.3 — a guess the import made stays an open item until the person answers
// it (the tick, or the copilot's confirm_item) or changes the part it filled. This is the second.

export function settleGuesses(before: ScriptDoc, after: ScriptDoc, notes: ScriptNotes): ScriptNotes {
  let changed = false;
  const confirmations = notes.confirmations.map((c) => {
    if (c.confirmed || !c.paths?.length) return c;
    const edited = c.paths.some((p) => {
      const target = parseFieldPath(p);
      if (!target) return false;
      const was = readField(before, notes, target);
      const now = readField(after, notes, target);
      // A field that is gone (its shot removed) was not edited.
      return was !== null && now !== null && was !== now;
    });
    if (!edited) return c;
    changed = true;
    return { ...c, confirmed: true };
  });
  return changed ? { ...notes, confirmations } : notes;
}
