import { shotSummary } from "../utils";
import type { Change } from "./change";
import { streamDraftCall } from "./draft-call";
import { buildImport, importSummary, resolveReelNumber } from "./import";
import { importPrompt, type CopilotBase } from "./messages";
import { importOutputSchema } from "./output";
import type { GenerateScript, ImportCard } from "./schema";
import type { Apply, TurnDeps, TurnInput } from "./turn";

// Paste-a-script spec §3 — a whole script pasted into the chat. With no draft yet it becomes the
// first draft, streamed into the pane while the writer reads it.

export async function prepareImport(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply> {
  const { script, ctx, text } = input;
  const args = { name: "script_import", ...importPrompt(base, { text }), schema: importOutputSchema };
  // Over a draft, nothing streams into the pane: the draft stays until the person chooses (§3).
  const out = script.doc ? await deps.call(args) : await streamDraftCall(deps, args);
  const reel = resolveReelNumber(out.reelNumber, ctx.library, script.id, script.doc?.header.reelNumber ?? script.brief.reelNumber);
  const built = buildImport(out, { paste: text, reelNumber: reel.reelNumber, takenReel: reel.taken, avatars: ctx.avatars });
  if ("error" in built) {
    const content = `I couldn't read that as a script: ${built.error} Nothing was changed. Try pasting the whole script, shot table included.`;
    return () => ({ patch: null, result: [{ content, card: null }] });
  }
  if (script.doc) {
    const card: ImportCard = {
      kind: "import", status: "pending", summary: importSummary(built.doc), replacing: shotSummary(script.doc),
      doc: built.doc, notes: built.notes, reply: built.reply,
    };
    return () => ({ patch: null, result: [{ content: "Replace the current draft with this script? Nothing changes until you choose.", card }] });
  }
  return (current) => {
    if (current.docVersion !== script.docVersion || current.doc) {
      return { error: "The script changed while I was working. Send that again.", status: 409 };
    }
    // The pasted script wins over a brief in progress (§3 step 2); what was given stays on the brief.
    const brief = { ...current.brief, phase: "written" as const, imported: true, reelNumber: built.doc.header.reelNumber, card: null };
    return { patch: { doc: built.doc, notes: built.notes, brief }, result: [{ content: built.reply, card: null }] };
  };
}

/** The person accepted a pasted script over the draft: it replaces the draft and its notes whole,
 *  whatever was typed since (they chose the paste). `replaces` keeps its guesses open (change.ts). */
export function acceptImport(current: GenerateScript, card: ImportCard): Change<{ reply: string }> {
  if (card.status !== "pending") return { error: "That was already settled.", status: 409 };
  const brief = { ...current.brief, phase: "written" as const, imported: true, reelNumber: card.doc.header.reelNumber, card: null };
  return { patch: { doc: card.doc, notes: card.notes, brief }, result: { reply: card.reply }, replaces: true };
}
