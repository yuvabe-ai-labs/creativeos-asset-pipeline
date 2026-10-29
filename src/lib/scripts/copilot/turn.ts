import type { ScriptDoc } from "../schema";
import { shotSummary } from "../utils";
import type { Change } from "./change";
import type { CopilotContext } from "./context";
import { newShotId as randomShotId, toScriptDoc } from "./draft";
import { fieldLabel, parseFieldPath, readField, writeField } from "./fields";
import { fillToFinal } from "./fill-to-final";
import { MAX_MESSAGE_CHARS } from "./constants";
import { streamDraftCall } from "./draft-call";
import { mightBeScript } from "./import";
import { prepareImport } from "./import-turn";
import { anglesPrompt, cardPrompt, detectPrompt, draftPrompt, editPrompt, extractPrompt, inlinePrompt, type CopilotBase } from "./messages";
import type { StreamingCall, StructuredCall } from "./model";
import type { PartialDraft } from "./partial-draft";
import { applyOps, beforeAfter, staleTargets, type OpsGen } from "./ops";
import { anglesOutputSchema, cardOutputSchema, detectOutputSchema, draftOutputSchema, editTurnSchema, extractionSchema, inlineOutputSchema } from "./output";
import { nextReelNumber, renderAvatars, renderLibrary } from "./prompt-context";
import { renderFormatMenu, SCRIPT_FORMATS } from "./formats";
import { cleanSuggestions } from "./suggestions";
import type { Brief, GenerateScript, MessageCard, ProposalCard, ScriptMessage, ScriptNotes } from "./schema";
import { renderConversation } from "./conversation";
import {
  angleText, applyAngle, cardToNotes, mergeExtraction, nextStep, normalizeAngles, normalizeCard,
  openItemsLine, questionFor, type Step,
} from "./brief";

// Spec 2 §5–§9 — one copilot turn. Model calls first (async), then a pure change that
// changeGenerateScript runs against the script as it is now and compare-and-sets (D332, D337).

/** `suggestions`: the brand-aware chips the model wrote with this reply (brand-neutral spec §3.1). */
export type Reply = { content: string; card: MessageCard | null; suggestions?: string[] };
export type TurnDeps = {
  /** The writing model (SCRIPT_WRITER_MODEL): the draft and chat edits. */
  call: StructuredCall;
  /** A faster model (SCRIPT_QUICK_MODEL) for reading the message, the angles and the card; the
   *  writer when absent. */
  quick?: StructuredCall;
  /** Streams the first draft (D337, refined); with it, `onDraft` sees each new part as it arrives. */
  stream?: StreamingCall;
  onDraft?: (draft: PartialDraft) => void;
  newShotId?: (taken: Set<string>) => string;
};
/** `leadAvatarId` comes with a lead chip: the avatar the person picked, linked as is (D362).
 *  `history`: the messages before this one; the copilot reads the last 10 of them (conversation.ts). */
export type TurnInput = { script: GenerateScript; ctx: CopilotContext; text: string; history: ScriptMessage[]; leadAvatarId?: string | null };
export type Apply = (current: GenerateScript) => Change<Reply[]>;

function baseFor(ctx: CopilotContext, format: string): CopilotBase {
  return {
    clientName: ctx.clientName, kbText: ctx.kbText, library: renderLibrary(ctx.library, format), avatars: renderAvatars(ctx.avatars),
    today: ctx.today, signalDigest: ctx.signals.digest, formatMenu: renderFormatMenu(format),
  };
}

export async function prepareTurn(input: TurnInput, deps: TurnDeps): Promise<Apply> {
  const format = input.script.doc?.header.format ?? input.script.brief.format.value;
  const base = baseFor(input.ctx, format);
  // A whole pasted script is imported, wherever the brief is (paste-a-script spec §3). The quick
  // model is asked only for long, many-line messages; chips and ordinary replies never pay for it.
  if (mightBeScript(input.text)) {
    const quick = deps.quick ?? deps.call;
    const seen = await quick({ name: "script_detect", ...detectPrompt(base, { hasDraft: input.script.doc !== null, text: input.text }), schema: detectOutputSchema });
    if (seen.wholeScript) return prepareImport(input, deps, base);
  }
  // Up to MAX_PASTE_CHARS is let in for a pasted script; anything else keeps the message limit.
  if (input.text.length > MAX_MESSAGE_CHARS) return () => ({ patch: null, result: [{ content: TOO_LONG, card: null }] });
  return input.script.doc ? prepareEdit(input, deps, base, input.script.doc) : prepareBrief(input, deps, base);
}

const TOO_LONG = `That's longer than a chat message can be (${MAX_MESSAGE_CHARS.toLocaleString("en")} characters), and it doesn't read as a whole script. If it is one, paste the whole script, shot table included.`;

async function prepareBrief(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply> {
  const { script, ctx, text } = input;
  const conversation = renderConversation(input.history);
  const avatarIds = new Set(ctx.avatars.map((a) => a.id));
  const formats = SCRIPT_FORMATS.map((f) => f.name);
  const nextReel = nextReelNumber(ctx.library);
  const quick = deps.quick ?? deps.call;

  const ex = await quick({ name: "script_brief_read", ...extractPrompt(base, { brief: script.brief, conversation, text }), schema: extractionSchema });
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

  // The chips of the model call that wrote the turn's last reply; format and lead are asked with
  // code chips (the format menu, the client's avatars), so only the occasion takes the reader's.
  let chips: readonly unknown[] = [];

  // A card that is showing is rebuilt when the person changed a piece or a line of it.
  let step: Step = brief.card && (changed || merged.cardChange) ? { kind: "card" } : nextStep(brief, false);
  for (let guard = 0; guard < 3; guard++) {
    if (step.kind === "ask") {
      say(withAck(questionFor(step.piece, { formats, avatars: ctx.avatars })));
      chips = step.piece === "occasion" ? ex.suggestions ?? [] : [];
      break;
    }
    if (step.kind === "angles") {
      const research = ctx.signals;
      const out = await quick({ name: "script_angles", ...anglesPrompt(base, { brief, signalBrief: research.brief, conversation, text }), schema: anglesOutputSchema });
      chips = out.suggestions ?? [];
      const angles = normalizeAngles(out.angles, research.list, avatarIds);
      if (angles.length === 0) throw new Error("The copilot proposed no angles.");
      brief = { ...brief, angles };
      // The card is the message: which signals each angle used, nothing explaining it.
      say(withAck(""), {
        kind: "research",
        signals: research.list,
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
      const out = await quick({ name: "script_card", ...cardPrompt(base, { brief, angle, cardChange: merged.cardChange, nextReel, conversation }), schema: cardOutputSchema });
      const card = normalizeCard(out, { reelNumber: brief.reelNumber ?? nextReel, avatarIds, lead });
      chips = out.suggestions ?? [];
      brief = { ...brief, card, phase: "confirm" };
      say(withAck(`Here's the brief I'll write from. Say "write it", or tell me which line to change.`), { kind: "confirmation", card });
      break;
    }
    if (step.kind === "confirm") {
      if (!ex.confirm || !brief.card) {
        say(withAck(`Say "write it" when the brief looks right, or tell me which line to change.`));
        chips = [];
        break;
      }
      const card = brief.card;
      const draftArgs = { name: "script_draft", ...draftPrompt(base, { brief, card, conversation }), schema: draftOutputSchema };
      const out = await streamDraftCall(deps, draftArgs);
      doc = toScriptDoc(out, { reelNumber: card.reelNumber, avatarIds, leadAvatarId: lead?.avatarId ?? null });
      notes = cardToNotes(card);
      brief = { ...brief, phase: "written" };
      say(`The first draft is in: ${shotSummary(doc)}. ${out.summary.trim()}\n\n${openItemsLine(fillToFinal(doc, notes))}`);
      chips = out.suggestions ?? [];
      break;
    }
    break;
  }
  const last = replies.at(-1);
  const cleaned = cleanSuggestions(chips);
  if (last && cleaned.length) last.suggestions = cleaned;

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
  const { script, ctx, text } = input;
  const conversation = renderConversation(input.history);
  const out = await deps.call({
    name: "script_edit",
    ...editPrompt(base, { doc, notes: script.notes, openItems: fillToFinal(doc, script.notes), conversation, text }),
    schema: editTurnSchema,
  });
  const gen: OpsGen = { newShotId: deps.newShotId ?? randomShotId, avatarIds: new Set(ctx.avatars.map((a) => a.id)) };
  const reply = out.reply.trim() || "Done.";
  const suggestions = cleanSuggestions(out.suggestions ?? []);
  const answer = (content: string, card: MessageCard | null = null): Reply[] => [{ content, card, suggestions }];
  return (current) => {
    if (out.ops.length === 0) return { patch: null, result: answer(reply) };
    if (!current.doc) return { error: "There's no draft to change.", status: 409 };
    // A shot the person typed into while the model worked is not overwritten (spec 2 §9).
    const stale = staleTargets(out.ops, doc.shots, current.doc);
    if (stale.length > 0) {
      return { patch: null, result: answer(`You changed ${stale.join(", ")} while I was working, so I left it as you wrote it. Ask me again if you still want the change.`) };
    }
    const r = applyOps(current.doc, current.notes, out.ops, gen);
    if (!r.ok) return { patch: null, result: answer(`I couldn't make that change: ${r.error} Nothing was changed.`) };
    if (r.touchedShotIds.length > 1) {
      const card: ProposalCard = { kind: "proposal", status: "pending", summary: reply, ops: out.ops, ...beforeAfter(current.doc, r.doc, r.touchedShotIds) };
      return { patch: null, result: answer(`${reply} It touches ${r.touchedShotIds.length} shots, so here it is before and after.`, card) };
    }
    return { patch: { doc: r.doc, notes: r.notes }, result: answer(`${reply}\n\n${openItemsLine(fillToFinal(r.doc, r.notes))}`) };
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
