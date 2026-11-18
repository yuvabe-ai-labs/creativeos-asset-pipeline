import { z } from "zod";
import { EMPTY_AGENT_REPLY, runAgent, type AgentEvents, type AgentMessage, type AgentModel, type AgentTool } from "@/lib/journey/agent";
import type { Attachment, ThreadMessage } from "@/lib/journey/thread/schema";
import { BuildAlreadyRunningError } from "@/lib/kb/build-errors";
import { kbCopilotSystem } from "@/prompts/kb-copilot";
import { KB_CONVERSATION_WINDOW, KB_REPLY_CHOICE_MAX_CHARS, KB_REPLY_CHOICES_MAX } from "./constants";
import { canStartBuild, fallbackSuggestions, isBuilding, nextStep, type KbContext } from "./context";
import type { KBFieldPatch } from "@/lib/kb/field-patch";
import { isEmpty, REVIEW_FIELD_PATHS, type ReviewField } from "./review";
import type { TurnWalk } from "./walk";

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
};

/** What a brand KB turn reports while it runs (D502), on top of what every agent turn reports. */
export type KbTurnEvents = AgentEvents & {
  /** A website or handles were just stored. */
  saved?: (saved: KbSaved) => void;
  /** Something on the page that `saved` cannot carry was just written: a field of the KB, a build. */
  page?: () => void;
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
const REVIEWED_LOCKED = "That field is already reviewed. It can be edited on the right. Proposing changes from the chat comes in a later step.";
const EMPTY_ANSWER = "No value was given.";
const NO_QUESTION = "No question is waiting.";

const fieldArg = z.enum(REVIEW_FIELD_PATHS as [string, ...string[]]);

/** The person's words in the shape the field holds: a list field takes items, a text field one text. */
function coerce(kind: ReviewField["kind"], value: string | string[]): string | string[] {
  if (kind === "list") {
    const items = Array.isArray(value) ? value : value.split(/[,\n]/);
    return items.map((item) => item.trim()).filter(Boolean);
  }
  return (Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean).join(", ") : value).trim();
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
  on?: KbTurnEvents;
}): Promise<{ reply: string; suggestions: string[]; changed: boolean; saved: KbSaved; walk: TurnWalk }> {
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

  // The review as the tools have changed it so far this turn. A tool only ever writes a field that
  // is still unreviewed: a reviewed field is the person's, and changes to it go through a change
  // card in a later part (spec §2.5).
  const review = input.review ?? null;
  const status = new Map(review?.fields.map((f) => [f.path, f.status]) ?? []);
  const walk: TurnWalk = { settled: [], skipped: false, more: false, stopped: false };
  /** The field a tool may write, or the sentence that refuses it. */
  const open = (path: string): ReviewField | string => {
    if (!review) return ctx.kbStatus === "ready" ? REVIEWED_LOCKED : NO_REVIEW;
    const field = review.fields.find((f) => f.path === path);
    if (!field) return NOT_IN_KB;
    return status.get(path) === "needs_review" ? field : REVIEWED_LOCKED;
  };
  /** False when the stored field turned out to be reviewed already: nothing was written. */
  const settle = async (field: ReviewField, patch: KBFieldPatch["patch"], reviewed: ReviewField["status"]): Promise<boolean> => {
    const written = await actions.setField(field.path, patch);
    // Reviewed either way now, so no second attempt this turn and the walk moves on from it.
    status.set(field.path, written ? reviewed : "approved");
    if (!written) return false;
    walk.settled.push(field.path);
    changed = true;
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
        if (typeof field === "string") return tell(field);
        const next = coerce(field.kind, value);
        if (isEmpty(next)) return tell(EMPTY_ANSWER);
        const saved = await settle(field, { value: next, status: "edited", evidence_type: "explicit", confidence: "high" }, "edited");
        return tell(saved ? `Saved ${field.label}.` : REVIEWED_LOCKED);
      },
    },
    confirm_field: {
      description: "Mark one unreviewed field as right as it stands: the person agreed with its value, or said there is none for an empty field.",
      schema: z.object({ field: fieldArg }),
      label: "Saving your answer…",
      run: async (args) => {
        const field = open((args as { field: string }).field);
        if (typeof field === "string") return tell(field);
        const saved = await settle(field, { status: "approved" }, "approved");
        return tell(saved ? `Marked ${field.label} as right.` : REVIEWED_LOCKED);
      },
    },
    skip_question: {
      description: "The person does not want to answer the question that is waiting. The field stays for them to review on the page.",
      schema: z.object({}),
      run: async () => {
        if (!review?.pending || status.get(review.pending) !== "needs_review") return tell(NO_QUESTION);
        walk.skipped = true;
        return "ok";
      },
    },
    keep_asking: {
      description: "The person wants questions about the brand KB: to start them, or to go on with more.",
      schema: z.object({}),
      run: async () => {
        if (!review) return tell(NO_REVIEW);
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
        if (ctx.hasVersion) return tell(WEBSITE_LOCKED);
        if (isBuilding(ctx)) return tell(WEBSITE_LOCKED_BUILDING);
        saved.website = await actions.saveWebsite(url);
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
        if (!handles.instagram && !handles.facebook) return tell("No handle was given.");
        const stored = await actions.saveSocials(handles);
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
        if (isBuilding(ctx)) return tell(ALREADY_RUNNING);
        if (ctx.hasVersion) return tell(ALREADY_BUILT);
        if (!canStartBuild(ctx)) return tell(NOTHING_TO_BUILD_FROM);
        try {
          await actions.startBuild();
        } catch (error) {
          if (error instanceof BuildAlreadyRunningError) return tell(ALREADY_RUNNING);
          throw error;
        }
        ctx = { ...ctx, job: { status: "queued", phaseMessage: null } };
        changed = true;
        input.on?.page?.();
        return tell("Started the build.");
      },
    },
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

  const messages: AgentMessage[] = [
    ...input.history.slice(-KB_CONVERSATION_WINDOW).map((m) => ({ role: m.role, content: userContent(m.content, m.attachments) })),
    { role: "user", content: userContent(input.text, input.attachments) },
  ];

  const { text } = await runAgent({
    model, system: kbCopilotSystem(input.ctx, review), messages, tools,
    on: input.on && { text: input.on.text, reset: input.on.reset, step: input.on.step },
  });
  // A turn can end without the model's words: after a plain save it is not asked again, and
  // sometimes it just says nothing. Say what the tools said, never a bare "Done." that could follow
  // a refusal, and while sources are still being collected, what comes next.
  const reply = text === EMPTY_AGENT_REPLY && said.length > 0 ? [said.join(" "), nextStep(ctx)].filter(Boolean).join("\n\n") : text;
  return { reply, suggestions: choices ?? fallbackSuggestions(ctx), changed, saved, walk };
}
