import type { ScriptDoc } from "../schema";
import { shotSummary } from "../utils";
import type { Change } from "./change";
import type { CopilotContext } from "./context";
import { newShotId as randomShotId, toScriptDoc } from "./draft";
import { fieldLabel, parseFieldPath, readField, writeField } from "./fields";
import { fillToFinal } from "./fill-to-final";
import { anglesPrompt, cardPrompt, draftPrompt, editPrompt, extractPrompt, inlinePrompt, type CopilotBase } from "./messages";
import type { StructuredCall } from "./model";
import { applyOps, beforeAfter, type OpsGen } from "./ops";
import { anglesOutputSchema, cardOutputSchema, draftOutputSchema, editTurnSchema, extractionSchema, inlineOutputSchema } from "./output";
import { libraryFormats, nextReelNumber, renderAvatars, renderLibrary } from "./prompt-context";
import type { Brief, GenerateScript, MessageCard, ProposalCard, ScriptNotes } from "./schema";
import {
  angleText, applyAngle, cardToNotes, mergeExtraction, nextStep, normalizeAngles, normalizeCard,
  openItemsLine, questionFor, type Step,
} from "./brief";

// Spec 2 §5–§9 — one copilot turn. Model calls first (async), then a pure change that
// changeGenerateScript runs against the script as it is now and compare-and-sets (D331, D336).

export type Reply = { content: string; card: MessageCard | null };
export type TurnDeps = {
  call: StructuredCall;
  loadSignals: () => Promise<{ brief: string; signals: { id: string; name: string }[] }>;
  newShotId?: (taken: Set<string>) => string;
};
export type TurnInput = { script: GenerateScript; ctx: CopilotContext; text: string; lastAssistant: string };
type Apply = (current: GenerateScript) => Change<Reply[]>;

function baseFor(ctx: CopilotContext, format: string): CopilotBase {
  return { clientName: ctx.clientName, kbText: ctx.kbText, library: renderLibrary(ctx.library, format), avatars: renderAvatars(ctx.avatars) };
}

export async function prepareTurn(input: TurnInput, deps: TurnDeps): Promise<Apply> {
  const format = input.script.doc?.header.format ?? input.script.brief.format.value;
  const base = baseFor(input.ctx, format);
  return input.script.doc ? prepareEdit(input, deps, base, input.script.doc) : prepareBrief(input, deps, base);
}

async function prepareBrief(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply> {
  const { script, ctx, text, lastAssistant } = input;
  const avatarIds = new Set(ctx.avatars.map((a) => a.id));
  const formats = libraryFormats(ctx.library).map((f) => f.format);
  const nextReel = nextReelNumber(ctx.library);

  const ex = await deps.call({ name: "script_brief_read", ...extractPrompt(base, { brief: script.brief, lastAssistant, text }), schema: extractionSchema });
  const merged = mergeExtraction(script.brief, ex, avatarIds);
  let brief: Brief = merged.brief;
  let doc: ScriptDoc | null = null;
  let notes: ScriptNotes | null = null;
  const replies: Reply[] = [];
  const say = (content: string, card: MessageCard | null = null) => replies.push({ content: content.trim(), card });
  let ack = ex.ack.trim();
  const withAck = (line: string) => {
    const out = ack ? `${ack}\n\n${line}` : line;
    ack = "";
    return out;
  };

  // A card that is showing is rebuilt when the person changed a piece or a line of it.
  let step: Step = brief.card && (merged.changed || merged.cardChange) ? { kind: "card" } : nextStep(brief, false);
  for (let guard = 0; guard < 3; guard++) {
    if (step.kind === "ask") {
      say(withAck(questionFor(step.piece, { formats, avatars: ctx.avatars })));
      break;
    }
    if (step.kind === "angles") {
      const research = await deps.loadSignals();
      const out = await deps.call({ name: "script_angles", ...anglesPrompt(base, { brief, signalBrief: research.brief, text }), schema: anglesOutputSchema });
      const angles = normalizeAngles(out.angles, new Set(research.signals.map((s) => s.id)), avatarIds);
      if (angles.length === 0) throw new Error("The copilot proposed no angles.");
      brief = { ...brief, angles };
      const n = research.signals.length;
      say(withAck(`I read the client's ${n} market signal${n === 1 ? "" : "s"} for where and when.${out.researchNote.trim() ? ` ${out.researchNote.trim()}` : ""}`), {
        kind: "research",
        signals: research.signals,
        perAngle: angles.map((a) => ({ angleId: a.id, signalIds: a.signalIds, note: a.fromSignals })),
      });
      say("Here are three angles. Pick one, blend two, or write your own.", { kind: "angles", angles });
      if (brief.narrative.status !== "skipped") break;
      brief = applyAngle(brief, angles[0], "proposed");
      say(`You left the angle to me, so I'll go with ${angles[0].id}: ${angles[0].hook}`);
      step = nextStep(brief, false);
      continue;
    }
    if (step.kind === "card") {
      const angle = brief.angles.find((a) => angleText(a) === brief.narrative.value) ?? null;
      const out = await deps.call({ name: "script_card", ...cardPrompt(base, { brief, angle, cardChange: merged.cardChange, nextReel }), schema: cardOutputSchema });
      const card = normalizeCard(out, { reelNumber: brief.reelNumber ?? nextReel, avatarIds });
      brief = { ...brief, card, phase: "confirm" };
      say(withAck(`Here's the brief I'll write from. Say "write it", or tell me which line to change.`), { kind: "confirmation", card });
      break;
    }
    if (step.kind === "confirm") {
      if (!ex.confirm || !brief.card) {
        say(withAck(`Say "write it" when the brief looks right, or tell me which line to change.`));
        break;
      }
      const card = brief.card;
      const out = await deps.call({ name: "script_draft", ...draftPrompt(base, { brief, card }), schema: draftOutputSchema });
      doc = toScriptDoc(out, { reelNumber: card.reelNumber, avatarIds });
      notes = cardToNotes(card);
      brief = { ...brief, phase: "written" };
      say(`The first draft is in: ${shotSummary(doc)}. ${out.summary.trim()}\n\n${openItemsLine(fillToFinal(doc, notes))}`);
      break;
    }
    break;
  }

  const finalBrief = brief;
  const finalDoc = doc;
  const finalNotes = notes;
  return (current) => {
    if (current.docVersion !== script.docVersion || current.doc) {
      return { error: "The script changed while I was working. Send that again.", status: 409 };
    }
    return { patch: finalDoc && finalNotes ? { brief: finalBrief, doc: finalDoc, notes: finalNotes } : { brief: finalBrief }, result: replies };
  };
}

async function prepareEdit(input: TurnInput, deps: TurnDeps, base: CopilotBase, doc: ScriptDoc): Promise<Apply> {
  const { script, ctx, text, lastAssistant } = input;
  const out = await deps.call({
    name: "script_edit",
    ...editPrompt(base, { doc, notes: script.notes, openItems: fillToFinal(doc, script.notes), lastAssistant, text }),
    schema: editTurnSchema,
  });
  const gen: OpsGen = { newShotId: deps.newShotId ?? randomShotId, avatarIds: new Set(ctx.avatars.map((a) => a.id)) };
  const reply = out.reply.trim() || "Done.";
  return (current) => {
    if (out.ops.length === 0) return { patch: null, result: [{ content: reply, card: null }] };
    if (!current.doc) return { error: "There's no draft to change.", status: 409 };
    const r = applyOps(current.doc, current.notes, out.ops, gen);
    if (!r.ok) return { patch: null, result: [{ content: `I couldn't make that change: ${r.error} Nothing was changed.`, card: null }] };
    if (r.touchedShotIds.length > 1) {
      const card: ProposalCard = { kind: "proposal", status: "pending", summary: reply, ops: out.ops, ...beforeAfter(current.doc, r.doc, r.touchedShotIds) };
      return { patch: null, result: [{ content: `${reply} It touches ${r.touchedShotIds.length} shots, so here it is before and after.`, card }] };
    }
    return { patch: { doc: r.doc, notes: r.notes }, result: [{ content: `${reply}\n\n${openItemsLine(fillToFinal(r.doc, r.notes))}`, card: null }] };
  };
}

export function acceptProposal(current: GenerateScript, card: ProposalCard, gen: OpsGen): Change<{ card: ProposalCard; reply: string }> {
  if (card.status !== "pending") return { error: "That change was already settled.", status: 409 };
  if (!current.doc) return { error: "There's no draft to change.", status: 409 };
  const r = applyOps(current.doc, current.notes, card.ops, gen);
  if (!r.ok) {
    return { patch: null, result: { card: { ...card, status: "stale" }, reply: "The script changed since I proposed that, so nothing was applied. Ask me again." } };
  }
  return {
    patch: { doc: r.doc, notes: r.notes },
    result: { card: { ...card, status: "accepted" }, reply: `Applied: ${card.summary}\n\n${openItemsLine(fillToFinal(r.doc, r.notes))}` },
  };
}

/** Replaces `selected` at `offset` in `text` (or, if the offset is stale, its first occurrence).
 *  The replacement is taken literally: `$&` and friends are not patterns. */
export function spliceSelection(text: string, selected: string, offset: number, replacement: string): string | null {
  const at = text.slice(offset, offset + selected.length) === selected ? offset : text.indexOf(selected);
  if (at < 0 || selected.length === 0) return null;
  return text.slice(0, at) + replacement + text.slice(at + selected.length);
}

export type InlineInput = { script: GenerateScript; ctx: CopilotContext; path: string; selectedText: string; offset: number; instruction: string };
type InlineApply = (current: GenerateScript) => Change<{ reply: string; undo: { path: string; before: string } }>;

export async function prepareInline(input: InlineInput, deps: { call: StructuredCall }): Promise<{ error: string; status: number } | InlineApply> {
  const target = parseFieldPath(input.path);
  if (!target || target.kind === "confirm") return { error: "That part of the script can't be edited this way.", status: 400 };
  const before = readField(input.script.doc, input.script.notes, target);
  if (before === null) return { error: "That part of the script is gone.", status: 404 };
  if (!before.includes(input.selectedText)) return { error: "That text changed. Select it again.", status: 409 };

  const base = baseFor(input.ctx, input.script.doc?.header.format ?? "");
  const out = await deps.call({
    name: "script_inline",
    ...inlinePrompt(base, { fieldLabel: fieldLabel(input.script.doc, target), fieldText: before, selectedText: input.selectedText, instruction: input.instruction }),
    schema: inlineOutputSchema,
  });

  return (current) => {
    const now = readField(current.doc, current.notes, target);
    if (now === null) return { error: "That part of the script is gone.", status: 404 };
    const next = spliceSelection(now, input.selectedText, input.offset, out.replacement);
    if (next === null) return { error: "That text changed while I was working. Select it again.", status: 409 };
    const written = writeField(current.doc, current.notes, target, next);
    if ("error" in written) return { error: written.error, status: 422 };
    return {
      patch: written.doc ? { doc: written.doc, notes: written.notes } : { notes: written.notes },
      result: { reply: `Changed ${fieldLabel(current.doc, target)}: ${out.summary.trim()}`, undo: { path: input.path, before: now } },
    };
  };
}
