import { z } from "zod";
import { EMPTY_AGENT_REPLY, runAgent, type AgentEvents, type AgentMessage, type AgentModel, type AgentTool, type TraceSink } from "@/lib/journey/agent";
import type { Attachment, ThreadMessage } from "@/lib/journey/thread/schema";
import { BuildAlreadyRunningError } from "@/lib/kb/build-errors";
import { kbCopilotSystem } from "@/prompts/kb-copilot";
import { KB_CONVERSATION_WINDOW, KB_REPLY_CHOICE_MAX_CHARS, KB_REPLY_CHOICES_MAX } from "./constants";
import { canStartBuild, fallbackSuggestions, isBuilding, nextStep, type KbContext } from "./context";
import type { KBFieldPatch } from "@/lib/kb/field-patch";
import { coerceValue as coerce, isEmpty, REVIEW_FIELD_PATHS, reviewFields, type ReviewField } from "./review";
import { walkChoice, type TurnWalk } from "./walk";
import type { BrandsCard, ChangeCard } from "@/lib/journey/thread/schema";
import type { MarketActions } from "@/lib/journey/market-copilot/context";
import { marketTools } from "@/lib/journey/market-copilot/tools";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { buildChangeCard, sameValue, type Proposal } from "@/lib/kb/changes/card";
import { kbTarget } from "./targets";

// One turn of the brand KB copilot: the agent's tools and the rules they enforce. The rules live
// here, in code, because the prompt can only ask (spec §6). The actions are passed in, so this
// file touches no database and is tested with a scripted model.

export { BuildAlreadyRunningError };

/** The sources a turn saved, as they are now stored: what the form beside the chat shows at once. */
export type KbSaved = { website?: string; instagram?: string; facebook?: string };

export type KbActions = {
  /** Both saves return what was stored, which may be tidier than what the person typed. */
  saveWebsite: (url: string) => Promise<string>;
  saveSocials: (handles: { instagram?: string; facebook?: string }) => Promise<{ instagram?: string; facebook?: string }>;
  /** Throws BuildAlreadyRunningError when one is already running. */
  startBuild: () => Promise<void>;
  /** Merges `patch` into the one field at `path` (dotted) of the KB in review, only if that field
   *  is still unreviewed as stored. False when it was not written: somebody reviewed it meanwhile. */
  setField: (path: string, patch: KBFieldPatch["patch"]) => Promise<boolean>;
  /** Market research (D530); its tools refuse without these. */
  market?: MarketActions;
};

/** What a brand KB turn reports while it runs (D514), on top of what every agent turn reports. */
export type KbTurnEvents = AgentEvents & {
  /** A website or handles were just stored. */
  saved?: (saved: KbSaved) => void;
  /** Something on the page that `saved` cannot carry was just written: a field of the KB, a build. */
  page?: () => void;
  /** What is being changed on the page, by target (D520): "writing" before the save, then "written"
   *  (before `page`) or "unwritten" when it was refused or failed. */
  target?: (target: string, phase: "writing" | "written" | "unwritten") => void;
};

/** The brand KB in review as this turn sees it: its fields, and the question waiting for an answer. */
export type KbReview = { fields: ReviewField[]; pending: string | null };

const ALREADY_RUNNING = "A build is already running.";
const ALREADY_BUILT = "The brand KB is already built. Changes to it come in a later step.";
const NOTHING_TO_BUILD_FROM = "I need a website or at least one document first.";
const WEBSITE_LOCKED = "The website cannot be changed here once the KB is built.";
const WEBSITE_LOCKED_BUILDING = "The website cannot be changed while a build is running.";
const NO_REVIEW = "There is no brand KB in review to answer about.";
const NOT_IN_KB = "That field is not in this brand KB.";
const REVIEWED_LOCKED = "That field is already reviewed. Use propose_change to suggest a new value; the person approves it.";
const NOT_REVIEWED_YET = "That field is not reviewed yet. Use answer_field.";
const REVIEWED_MEANWHILE = "That field was reviewed a moment ago, so nothing was saved.";
/** A value the person gave for an unreviewed field, saved as their own answer. */
const answerPatch = (value: ReviewField["value"]): KBFieldPatch["patch"] => ({ value, status: "edited", evidence_type: "explicit", confidence: "high" });
const NO_KB = "There is no brand KB to change yet.";
const ALREADY_THE_VALUE = "That is already the value.";
const CHANGE_READY = "Here is the change. Nothing changes until you approve it.";
/** Words that tell the person a change card is waiting. Only a turn that made a card may say them. */
const CLAIMS_CHANGE = /\bhere is the change\b|\bchange card\b/i;
/** What the model is told when it said a change is ready but called no tool. */
const CLAIMED_WITHOUT_CARD = "You said a change is ready, but you did not call propose_change, so no change card was made. If the person asked to change a field, call propose_change now. Otherwise answer without saying a change is ready.";
const ASKED_AGAIN = "Said a change was ready without calling propose_change; asked again.";
/** The reply when the model still claims a change it never proposed. */
const NO_CHANGE_MADE = "No change was prepared that time. Ask again and I will make the change card.";
/** Where a value the person states in the chat came from, as a change card shows it. */
export const FROM_CHAT = "You, in this chat";
const EMPTY_ANSWER = "No value was given.";
/** What code says after a walk button whose tool says nothing itself. */
const CHOICE_REPLY: Record<string, string> = {
  skip_question: "Skipped. It stays for you to review on the right.",
  keep_asking: "Sure.",
  stop_asking: "No more questions. The rest is for you to review on the right.",
};
const NO_QUESTION = "No question is waiting.";

const fieldArg = z.enum(REVIEW_FIELD_PATHS as [string, ...string[]]);


/** A stored message's words for the model. A status line stored on its own (a failed job, D518) has
 *  no words, so the model reads its lines instead. A change card is not written out: written as
 *  "[propose_change made a change card…]", the model copied that line as its reply instead of
 *  calling the tool (2026-11-26). */
function storedWords(m: ThreadMessage): string {
  if (m.content || m.card?.kind !== "status") return m.content;
  return m.card.lines.map((l) => l.text).join("\n");
}

function userContent(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const list = attachments.map((a) => `${a.name} (${a.kind})`).join(", ");
  return [text, `Attached: ${list}`].filter(Boolean).join("\n");
}

export async function runKbTurn(input: {
  ctx: KbContext; history: ThreadMessage[]; text: string; attachments: Attachment[];
  actions: KbActions; model: AgentModel;
  /** Null or left out unless a built KB is in review. */
  review?: KbReview | null;
  /** The client's brand KB as stored, when one has been built: what a change card is made against. */
  kb?: { versionId: string; output: TraceableBrandKB } | null;
  on?: KbTurnEvents;
  /** Where the turn reports what it did, for its trace (D521). */
  trace?: TraceSink;
}): Promise<{ reply: string; suggestions: string[]; changed: boolean; saved: KbSaved; walk: TurnWalk; card: ChangeCard | BrandsCard | null }> {
  const { actions, model } = input;
  // The context as the tools have changed it so far this turn, so a later tool sees an earlier one.
  let ctx = input.ctx;
  let changed = false;
  const saved: KbSaved = {};
  let choices: string[] | null = null;
  // What each tool told the model, in plain sentences, in case the model adds no words of its own.
  const said: string[] = [];
  const tell = (sentence: string) => {
    said.push(sentence);
    return sentence;
  };
  /** A refusal said in a sentence rather than thrown: the trace marks the turn as refused (D521). */
  const refuse = (sentence: string) => {
    input.trace?.refused(sentence);
    return tell(sentence);
  };

  // The review as the tools have changed it so far this turn. A tool only ever writes a field that
  // is still unreviewed: a reviewed field is the person's, and changes to it go through a change
  // card in a later part (spec §2.5).
  const review = input.review ?? null;
  const status = new Map(review?.fields.map((f) => [f.path, f.status]) ?? []);
  const walk: TurnWalk = { settled: [], skipped: false, more: false, stopped: false };
  // Every field of the built KB, for changes to reviewed fields (spec §2.4). During the first review
  // a field's status is the one this turn has seen; otherwise it is as stored.
  const kbFields = input.kb ? reviewFields(input.kb.output) : [];
  const statusOf = (path: string) => status.get(path) ?? kbFields.find((f) => f.path === path)?.status;
  const proposals: Proposal[] = [];
  let toldChange = false;
  /** A list of brands this turn made (D530), stored as its own message after the reply. */
  let brandsCard: BrandsCard | null = null;
  // How many times the model has been asked, and when a change call only saved (no card). A turn that
  // ends on that call ends on code's words: the model wrote its own expecting a card (review fix).
  let modelCalls = 0;
  let savedOnlyAt = -1;
  let askedAgain = false;
  /** Words that say a change card is waiting, in a turn that made none. Only where a turn can make
   *  a card: a built KB. */
  const claimsMissingCard = (text: string) => input.kb != null && proposals.length === 0 && CLAIMS_CHANGE.test(text);
  const counted: AgentModel = async (i) => {
    modelCalls += 1;
    const started = Date.now();
    const out = await model(i);
    // The model said a change is ready but called no tool, so no card exists (2026-11-26: it copied
    // "Here is the change…" from earlier turns). Asked once more, told why, with propose_change
    // forced: only asked, it ignored the request twice. The tool's own code still decides what is
    // allowed. The words it already streamed are cleared first. A second false claim (the tool was
    // not offered, so nothing could be forced) is replaced after the loop.
    if (askedAgain || out.calls.length > 0 || !claimsMissingCard(out.text)) return out;
    askedAgain = true;
    input.trace?.round({ text: out.text, calls: [], results: [], ms: Date.now() - started });
    input.trace?.refused(ASKED_AGAIN);
    input.on?.reset?.();
    return model({
      ...i, force: "propose_change",
      messages: [...i.messages, { role: "assistant", content: out.text }, { role: "user", content: CLAIMED_WITHOUT_CARD }],
    });
  };
  /** The field a tool may write, or the sentence that refuses it. */
  const open = (path: string): ReviewField | string => {
    if (!review) return ctx.kbStatus === "ready" ? REVIEWED_LOCKED : NO_REVIEW;
    const field = review.fields.find((f) => f.path === path);
    if (!field) return NOT_IN_KB;
    return status.get(path) === "needs_review" ? field : REVIEWED_LOCKED;
  };
  /** False when the stored field turned out to be reviewed already: nothing was written. */
  const settle = async (field: ReviewField, patch: KBFieldPatch["patch"], reviewed: ReviewField["status"]): Promise<boolean> => {
    const target = kbTarget.field(field.path);
    input.on?.target?.(target, "writing");
    let written: boolean;
    try {
      written = await actions.setField(field.path, patch);
    } catch (error) {
      input.on?.target?.(target, "unwritten");
      throw error;
    }
    // Reviewed either way now, so no second attempt this turn and the walk moves on from it.
    status.set(field.path, written ? reviewed : "approved");
    if (!written) {
      input.on?.target?.(target, "unwritten");
      return false;
    }
    walk.settled.push(field.path);
    changed = true;
    input.on?.target?.(target, "written");
    input.on?.page?.();
    return true;
  };

  const tools: Record<string, AgentTool> = {
    answer_field: {
      description: "Save the person's own answer as the value of one unreviewed field of the brand KB. Only what the person said, never a value of your own.",
      schema: z.object({ field: fieldArg, value: z.union([z.string(), z.array(z.string())]) }),
      label: "Saving your answer…",
      run: async (args) => {
        const { field: path, value } = args as { field: string; value: string | string[] };
        const field = open(path);
        if (typeof field === "string") return refuse(field);
        const next = coerce(field.kind, value);
        if (isEmpty(next)) return refuse(EMPTY_ANSWER);
        const saved = await settle(field, answerPatch(next), "edited");
        return saved ? tell(`Saved ${field.label}.`) : refuse(REVIEWED_LOCKED);
      },
    },
    confirm_field: {
      description: "Mark one unreviewed field as right as it stands: the person agreed with its value, or said there is none for an empty field.",
      schema: z.object({ field: fieldArg }),
      label: "Saving your answer…",
      run: async (args) => {
        const field = open((args as { field: string }).field);
        if (typeof field === "string") return refuse(field);
        const saved = await settle(field, { status: "approved" }, "approved");
        return saved ? tell(`Marked ${field.label} as right.`) : refuse(REVIEWED_LOCKED);
      },
    },
    propose_change: {
      description: "Propose new values for fields of the brand KB that a person has already reviewed. Only what the person said. Nothing changes until a person approves the change card this makes. A field nobody has reviewed yet is saved as the person's answer instead.",
      schema: z.object({ changes: z.array(z.object({ field: fieldArg, value: z.union([z.string(), z.array(z.string())]) })).min(1).max(10) }),
      label: "Preparing the change…",
      // The card is the answer: the reply after it is worded here.
      ends: true,
      run: async (args) => {
        // A refusal is thrown, not returned: it goes back to the model, which answers in its own
        // words (a turn that "ends" never asks it again, and these sentences are written for it).
        if (!input.kb) throw new Error(NO_KB);
        const refusals: string[] = [];
        // What this call added, so a call that is only partly allowed says which part.
        const added: string[] = [];
        // Unreviewed fields saved as the person's answer (2026-11-19): "edit the mission statement
        // to …" came here for an unreviewed field, was refused with "Use answer_field", and the model
        // told the person so instead of saving. The words are the person's own, so code saves them.
        const filled: string[] = [];
        for (const { field: path, value } of (args as { changes: { field: string; value: string | string[] }[] }).changes) {
          const field = kbFields.find((f) => f.path === path);
          if (!field) { refusals.push(NOT_IN_KB); continue; }
          if (statusOf(path) === "needs_review") {
            // Only during the review can an unreviewed field be written (an approved KB has none).
            const unreviewed = review ? open(path) : NOT_REVIEWED_YET;
            if (typeof unreviewed === "string") { refusals.push(unreviewed); continue; }
            const answer = coerce(unreviewed.kind, value);
            if (isEmpty(answer)) { refusals.push(EMPTY_ANSWER); continue; }
            if (await settle(unreviewed, answerPatch(answer), "edited")) filled.push(unreviewed.label);
            else refusals.push(REVIEWED_MEANWHILE);
            continue;
          }
          const next = coerce(field.kind, value);
          if (isEmpty(next) && isEmpty(field.value)) { refusals.push(ALREADY_THE_VALUE); continue; }
          if (sameValue(field.value, next)) { refusals.push(ALREADY_THE_VALUE); continue; }
          proposals.push({ path, value: isEmpty(next) ? null : next, from: FROM_CHAT, docId: null });
          added.push(field.label);
        }
        const savedLine = filled.length > 0 ? tell(`Saved ${filled.join(", ")}.`) : null;
        const withSaved = (sentence: string) => [savedLine, sentence].filter(Boolean).join(" ");
        if (added.length === 0) {
          // Every field was unreviewed and saved: a plain save, so the turn ends on it.
          if (refusals.length === 0) {
            savedOnlyAt = modelCalls;
            return savedLine as string;
          }
          throw new Error(withSaved(refusals.join(" ")));
        }
        // Partly refused: what was added stays on the card, and the model is told about the rest so
        // it can say so. Ending the turn here would drop the refusal without a word.
        if (refusals.length > 0) throw new Error(withSaved(`Added ${added.join(", ")} to the change. Not added: ${refusals.join(" ")}`));
        if (toldChange) return withSaved("Added to the change.");
        toldChange = true;
        return withSaved(tell(CHANGE_READY));
      },
    },
    skip_question: {
      description: "The person does not want to answer the question that is waiting. The field stays for them to review on the page.",
      schema: z.object({}),
      run: async () => {
        if (!review?.pending || status.get(review.pending) !== "needs_review") return refuse(NO_QUESTION);
        walk.skipped = true;
        return "ok";
      },
    },
    keep_asking: {
      description: "The person wants questions about the brand KB: to start them, or to go on with more.",
      schema: z.object({}),
      run: async () => {
        if (!review) return refuse(NO_REVIEW);
        walk.more = true;
        return "ok";
      },
    },
    stop_asking: {
      description: "The person wants no more questions and will review the rest themselves.",
      schema: z.object({}),
      run: async () => {
        walk.stopped = true;
        return "ok";
      },
    },
    save_website: {
      description: "Save the brand's website address. Use it when the person gives a website.",
      schema: z.object({ url: z.string().min(1).max(500) }),
      // A plain save: the reply after it is worded here, so the model is not asked a second time.
      ends: true,
      label: "Saving the website…",
      run: async (args) => {
        const { url } = args as { url: string };
        if (ctx.hasVersion) return refuse(WEBSITE_LOCKED);
        if (isBuilding(ctx)) return refuse(WEBSITE_LOCKED_BUILDING);
        const site = kbTarget.form("website");
        input.on?.target?.(site, "writing");
        try {
          saved.website = await actions.saveWebsite(url);
        } catch (error) {
          input.on?.target?.(site, "unwritten");
          throw error;
        }
        input.on?.target?.(site, "written");
        ctx = { ...ctx, websiteUrl: saved.website };
        changed = true;
        input.on?.saved?.({ website: saved.website });
        return tell("Saved the website.");
      },
    },
    save_socials: {
      description: "Save the brand's Instagram and/or Facebook handle. Pass only the ones the person gave.",
      schema: z.object({ instagram: z.string().min(1).max(200).optional(), facebook: z.string().min(1).max(200).optional() }),
      ends: true,
      label: "Saving the handles…",
      run: async (args) => {
        const handles = args as { instagram?: string; facebook?: string };
        if (!handles.instagram && !handles.facebook) return refuse("No handle was given.");
        const given = (["instagram", "facebook"] as const).filter((h) => handles[h]);
        for (const h of given) input.on?.target?.(kbTarget.form(h), "writing");
        let stored: { instagram?: string; facebook?: string };
        try {
          stored = await actions.saveSocials(handles);
        } catch (error) {
          for (const h of given) input.on?.target?.(kbTarget.form(h), "unwritten");
          throw error;
        }
        for (const h of given) input.on?.target?.(kbTarget.form(h), stored[h] ? "written" : "unwritten");
        // Only what was stored just now: the turn's own `saved` may already hold the website.
        const now: KbSaved = {};
        if (stored.instagram) now.instagram = saved.instagram = stored.instagram;
        if (stored.facebook) now.facebook = saved.facebook = stored.facebook;
        ctx = { ...ctx, instagram: stored.instagram ?? ctx.instagram, facebook: stored.facebook ?? ctx.facebook };
        changed = true;
        input.on?.saved?.(now);
        return tell("Saved the handles.");
      },
    },
    start_build: {
      description: "Start building the brand KB from the saved sources. Only after the person has said to start.",
      schema: z.object({}),
      label: "Starting the build…",
      run: async () => {
        if (isBuilding(ctx)) return refuse(ALREADY_RUNNING);
        if (ctx.hasVersion) return refuse(ALREADY_BUILT);
        if (!canStartBuild(ctx)) return refuse(NOTHING_TO_BUILD_FROM);
        try {
          await actions.startBuild();
        } catch (error) {
          if (error instanceof BuildAlreadyRunningError) return refuse(ALREADY_RUNNING);
          throw error;
        }
        ctx = { ...ctx, job: { status: "queued", phaseMessage: null } };
        changed = true;
        input.on?.page?.();
        return tell("Started the build.");
      },
    },
    // Market research (D530): its tools refuse until the brand KB is approved.
    ...marketTools({
      market: () => ctx.market,
      setMarket: (market) => { ctx = { ...ctx, market }; },
      actions: actions.market,
      emit: (card) => { brandsCard = card; },
      tell, refuse,
    }),
    reply_choices: {
      description: "Offer the person's likely answers as buttons under your message. Short phrases they could send as they are.",
      // Nothing to say back: words written beside the buttons are the reply.
      quiet: true,
      schema: z.object({ choices: z.array(z.string().min(1).max(KB_REPLY_CHOICE_MAX_CHARS)).min(1).max(KB_REPLY_CHOICES_MAX) }),
      run: async (args) => {
        choices = (args as { choices: string[] }).choices;
        return "ok";
      },
    },
  };

  // A button the walk offered is carried out here, with no model call (D519): the model once
  // answered "Yes, that's right" with words and no tool, so nothing was saved and the question came
  // back. The tool's own code runs, so its refusals still apply, and its sentence is the reply.
  const choice = input.attachments.length === 0 ? walkChoice(input.text, review) : null;
  if (choice) {
    const tool = tools[choice.tool];
    if (tool.label) input.on?.step?.(tool.label);
    let output: string;
    try {
      output = await tool.run(choice.args);
    } catch (error) {
      // A failed button turn is the one most worth seeing in its trace.
      input.trace?.choice({ tool: choice.tool, args: choice.args, output: `Error: ${error instanceof Error ? error.message : String(error)}` });
      throw error;
    }
    input.trace?.choice({ tool: choice.tool, args: choice.args, output });
    const reply = said.length > 0 ? said.join(" ") : CHOICE_REPLY[choice.tool];
    return { reply, suggestions: fallbackSuggestions(ctx), changed, saved, walk, card: null };
  }

  const messages: AgentMessage[] = [
    ...input.history.slice(-KB_CONVERSATION_WINDOW).map((m) => ({ role: m.role, content: userContent(storedWords(m), m.attachments) })),
    { role: "user", content: userContent(input.text, input.attachments) },
  ];

  const { text } = await runAgent({
    model: counted, system: kbCopilotSystem(input.ctx, review, review ? null : kbFields), messages, tools,
    on: input.on && { text: input.on.text, reset: input.on.reset, step: input.on.step },
    trace: input.trace,
  });
  // A turn can end without the model's words: after a plain save it is not asked again, and
  // sometimes it just says nothing. Say what the tools said, never a bare "Done." that could follow
  // a refusal, and while sources are still being collected, what comes next.
  const codeWords = text === EMPTY_AGENT_REPLY || savedOnlyAt === modelCalls;
  // Asked again and still claiming a card that was never made: never stored as if it were true.
  const falseClaim = !codeWords && claimsMissingCard(text);
  if (falseClaim) input.trace?.refused(NO_CHANGE_MADE);
  const reply = falseClaim
    ? NO_CHANGE_MADE
    : codeWords && said.length > 0 ? [said.join(" "), nextStep(ctx)].filter(Boolean).join("\n\n") : text;
  const card = input.kb && proposals.length > 0
    ? buildChangeCard({ versionId: input.kb.versionId, current: input.kb.output, proposals, refused: new Set() })
    : brandsCard;
  return { reply, suggestions: card ? [] : choices ?? fallbackSuggestions(ctx), changed, saved, walk, card };
}
