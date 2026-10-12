import { streamDraftCall } from "./draft-call";
import { buildImport, resolveReelNumber } from "./import";
import { importPrompt, type CopilotBase } from "./messages";
import { importOutputSchema } from "./output";
import type { Apply, TurnDeps, TurnInput } from "./turn";

// Paste-a-script spec §3 — a whole script pasted into the chat. With no draft yet it becomes the
// first draft, streamed into the pane while the writer reads it.

export async function prepareImport(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply> {
  const { script, ctx, text } = input;
  const out = await streamDraftCall(deps, { name: "script_import", ...importPrompt(base, { text }), schema: importOutputSchema });
  const reel = resolveReelNumber(out.reelNumber, ctx.library, script.id, script.brief.reelNumber);
  const built = buildImport(out, { paste: text, reelNumber: reel.reelNumber, takenReel: reel.taken, avatars: ctx.avatars });
  if ("error" in built) {
    const content = `I couldn't read that as a script: ${built.error} Nothing was changed. Try pasting the whole script, shot table included.`;
    return () => ({ patch: null, result: [{ content, card: null }] });
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
