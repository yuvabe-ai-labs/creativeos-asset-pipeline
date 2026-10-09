import type { ScriptDoc } from "../schema";
import { shotSummary } from "../utils";
import type { Change } from "./change";
import type { CopilotContext } from "./context";
import { newShotId as randomShotId, toScriptDoc } from "./draft";
import { fieldLabel, parseFieldPath, readField, writeField } from "./fields";
import { fillToFinal } from "./fill-to-final";
import { anglesPrompt, cardPrompt, draftPrompt, editPrompt, extractPrompt, inlinePrompt, type CopilotBase } from "./messages";
import type { StreamingCall, StructuredCall } from "./model";
import { parsePartialDraft, type PartialDraft } from "./partial-draft";
import { applyOps, beforeAfter, staleTargets, type OpsGen } from "./ops";
import { anglesOutputSchema, cardOutputSchema, draftOutputSchema, editTurnSchema, extractionSchema, inlineOutputSchema } from "./output";
import { libraryFormats, nextReelNumber, renderAvatars, renderLibrary } from "./prompt-context";
import type { Brief, GenerateScript, MessageCard, ProposalCard, ScriptNotes } from "./schema";
import {
  angleText, applyAngle, cardToNotes, mergeExtraction, nextStep, normalizeAngles, normalizeCard,
  openItemsLine, questionFor, type Step,
} from "./brief";

// Spec 2 §5–§9 — one copilot turn. Model calls first (async), then a pure change that
// changeGenerateScript runs against the script as it is now and compare-and-sets (D332, D337).

export type Reply = { content: string; card: MessageCard | null };
export type TurnDeps = {
  /** The writing model (SCRIPT_WRITER_MODEL): the draft and chat edits. */
  call: StructuredCall;
  /** A faster model (SCRIPT_QUICK_MODEL) for reading the message, the angles and the card; the
   *  writer when absent. */
  quick?: StructuredCall;
  /** Streams the first draft (D337, refined); with it, `onDraft` sees each new part as it arrives. */
  stream?: StreamingCall;
  onDraft?: (draft: PartialDraft) => void;
  loadSignals: () => Promise<{ brief: string; signals: { id: string; name: string }[] }>;
  newShotId?: (taken: Set<string>) => string;
};
/** `leadAvatarId` comes with a lead chip: the avatar the person picked, linked as is (D362). */
export type TurnInput = { script: GenerateScript; ctx: CopilotContext; text: string; lastAssistant: string; leadAvatarId?: string | null };
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
  const quick = deps.quick ?? deps.call;

  const ex = await quick({ name: "script_brief_read", ...extractPrompt(base, { brief: script.brief, lastAssistant, text }), schema: extractionSchema });
  const merged = mergeExtraction(script.brief, ex, avatarIds);
  let brief: Brief = merged.brief;
  let changed = merged.changed;
  // A picked lead chip is the lead, whatever the model made of the name (two avatars can share one).
  const picked = input.leadAvatarId ? ctx.avatars.find((a) => a.id === input.leadAvatarId) : undefined;
  if (picked) {
    if (brief.leadAvatarId !== picked.id) changed = true;
    brief = { ...brief, lead: { value: picked.name, status: "given" }, leadAvatarId: picked.id };
  }
  const leadAvatar = ctx.avatars.find((a) => a.id === brief.leadAvatarId);
  const lead = leadAvatar ? { avatarId: leadAvatar.id, name: leadAvatar.name } : null;
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
  let step: Step = brief.card && (changed || merged.cardChange) ? { kind: "card" } : nextStep(brief, false);
  for (let guard = 0; guard < 3; guard++) {
    if (step.kind === "ask") {
      say(withAck(questionFor(step.piece, { formats, avatars: ctx.avatars })));
      break;
    }
    if (step.kind === "angles") {
      const research = await deps.loadSignals();
      const out = await quick({ name: "script_angles", ...anglesPrompt(base, { brief, signalBrief: research.brief, text }), schema: anglesOutputSchema });
      const angles = normalizeAngles(out.angles, research.signals, avatarIds);
      if (angles.length === 0) throw new Error("The copilot proposed no angles.");
      brief = { ...brief, angles };
      // The card is the message: which signals each angle used, nothing explaining it.
      say(withAck(""), {
        kind: "research",
        signals: research.signals,
        perAngle: angles.map((a) => ({ angleId: a.id, signalIds: a.signalIds })),
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
      const out = await quick({ name: "script_card", ...cardPrompt(base, { brief, angle, cardChange: merged.cardChange, nextReel }), schema: cardOutputSchema });
      const card = normalizeCard(out, { reelNumber: brief.reelNumber ?? nextReel, avatarIds, lead });
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
      const draftArgs = { name: "script_draft", ...draftPrompt(base, { brief, card }), schema: draftOutputSchema };
      let shown = "";
      const out = deps.stream
        ? await deps.stream(draftArgs, (text) => {
          const partial = parsePartialDraft(text);
          if (!partial) return;
          // Report only when something new can be drawn: a header field, a person or a whole shot.
          const sig = `${Object.keys(partial.header).length}:${partial.cast.length}:${partial.shots.length}`;
          if (sig === shown) return;
          shown = sig;
          deps.onDraft?.(partial);
        })
        : await deps.call(draftArgs);
      doc = toScriptDoc(out, { reelNumber: card.reelNumber, avatarIds, leadAvatarId: lead?.avatarId ?? null });
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
    // A shot the person typed into while the model worked is not overwritten (spec 2 §9).
    const stale = staleTargets(out.ops, doc.shots, current.doc);
    if (stale.length > 0) {
      return { patch: null, result: [{ content: `You changed ${stale.join(", ")} while I was working, so I left it as you wrote it. Ask me again if you still want the change.`, card: null }] };
    }
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
  // card.before is the shots as they were when proposed: a shot changed since then is not overwritten.
  const stale = staleTargets(card.ops, card.before, current.doc);
  if (stale.length > 0) {
    return { patch: null, result: { card: { ...card, status: "stale" }, reply: `You changed ${stale.join(", ")} since I proposed that, so nothing was applied. Ask me again.` } };
  }
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
