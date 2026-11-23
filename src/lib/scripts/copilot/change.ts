import { settleGuesses } from "./guesses";
import type { GenerateScript, ScriptPatch } from "./schema";

/** What a change decides from the script as it stands: a patch to save (or null for none) and a
 *  result for the caller, or an error to return as-is. Must be pure: it can run more than once.
 *  `replaces`: the patch is a whole new draft (an accepted import), not an edit of this one. */
export type Change<T> = { patch: ScriptPatch | null; result: T; replaces?: true } | { error: string; status: number };
export type ChangeOutcome<T> = { script: GenerateScript; result: T } | { error: string; status: number };

type ChangeIO = {
  read: () => Promise<GenerateScript | null>;
  /** Saves only if the stored script is still the one read (`current`); null when it moved on. At
   *  Generate that is its doc version, at Visualise its `updated_at` (as every Visualise write). */
  save: (current: GenerateScript, patch: ScriptPatch) => Promise<GenerateScript | null>;
};

/** The stage a change is for. A change for Generate refuses any other stage, as before; piece 5.1
 *  lets the copilot change a script at Visualise too (D524). */
export type ChangeOptions = { stage?: "generate" | "visualise" };

/** Read, decide, compare-and-set; on a conflict, read the newer script and decide again. A copilot
 *  edit is therefore always applied to the script as it is now, never to the copy the model saw. */
export async function changeWithRetry<T>(
  io: ChangeIO, change: (current: GenerateScript) => Change<T>, { stage = "generate" }: ChangeOptions = {}, attempts = 3,
): Promise<ChangeOutcome<T>> {
  for (let i = 0; i < attempts; i++) {
    const current = await io.read();
    if (!current) return { error: "Script not found.", status: 404 };
    if (current.stage !== stage) {
      return stage === "generate"
        ? { error: "This script is final. Reopen it from Visualise to change it.", status: 409 }
        : { error: "The script has moved on from Visualise, so nothing was changed.", status: 409 };
    }
    const decided = change(current);
    if ("error" in decided) return decided;
    if (decided.patch === null) return { script: current, result: decided.result };
    const saved = await io.save(current, withSettledGuesses(current, decided.patch, decided.replaces === true));
    if (saved) return { script: saved, result: decided.result };
  }
  return { error: "The script kept changing while saving. Try again.", status: 409 };
}

/** Every edit of the draft passes here, so a guess whose field it changed is settled in the same
 *  save (guesses.ts). A replacing patch brings its own guesses, so nothing is settled. */
function withSettledGuesses(current: GenerateScript, patch: ScriptPatch, replaces: boolean): ScriptPatch {
  if (replaces || !current.doc || !patch.doc) return patch;
  const notes = patch.notes ?? current.notes;
  const settled = settleGuesses(current.doc, patch.doc, notes);
  return settled === notes ? patch : { ...patch, notes: settled };
}
