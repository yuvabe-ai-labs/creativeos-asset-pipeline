import { z } from "zod";
import { EMPTY_AGENT_REPLY, runAgent, type AgentMessage, type AgentModel, type AgentTool } from "@/lib/journey/agent";
import type { Attachment, ThreadMessage } from "@/lib/journey/thread/schema";
import { BuildAlreadyRunningError } from "@/lib/kb/build-errors";
import { kbCopilotSystem } from "@/prompts/kb-copilot";
import { KB_CONVERSATION_WINDOW, KB_REPLY_CHOICE_MAX_CHARS, KB_REPLY_CHOICES_MAX } from "./constants";
import { canStartBuild, fallbackSuggestions, isBuilding, type KbContext } from "./context";
import type { KBFieldPatch } from "@/lib/kb/field-patch";
import { isEmpty, REVIEW_FIELD_PATHS, type ReviewField } from "./review";
import type { TurnWalk } from "./walk";

// One turn of the brand KB copilot: the agent's tools and the rules they enforce. The rules live
// here, in code, because the prompt can only ask (spec §6). The actions are passed in, so this
// file touches no database and is tested with a scripted model.

export { BuildAlreadyRunningError };

export type KbActions = {
  saveWebsite: (url: string) => Promise<void>;
  saveSocials: (handles: { instagram?: string; facebook?: string }) => Promise<void>;
  /** Throws BuildAlreadyRunningError when one is already running. */
  startBuild: () => Promise<void>;
  /** Merges `patch` into the one field at `path` (dotted) of the KB in review. */
  setField: (path: string, patch: KBFieldPatch["patch"]) => Promise<void>;
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
}): Promise<{ reply: string; suggestions: string[]; changed: boolean; walk: TurnWalk }> {
  const { actions, model } = input;
  // The context as the tools have changed it so far this turn, so a later tool sees an earlier one.
  let ctx = input.ctx;
  let changed = false;
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
  const settle = async (field: ReviewField, patch: KBFieldPatch["patch"], reviewed: ReviewField["status"]) => {
    await actions.setField(field.path, patch);
    status.set(field.path, reviewed);
    walk.settled.push(field.path);
    changed = true;
  };

  const tools: Record<string, AgentTool> = {
    answer_field: {
      description: "Save the person's own answer as the value of one unreviewed field of the brand KB. Only what the person said, never a value of your own.",
      schema: z.object({ field: fieldArg, value: z.union([z.string(), z.array(z.string())]) }),
      run: async (args) => {
        const { field: path, value } = args as { field: string; value: string | string[] };
        const field = open(path);
        if (typeof field === "string") return tell(field);
        const next = coerce(field.kind, value);
        if (isEmpty(next)) return tell(EMPTY_ANSWER);
        await settle(field, { value: next, status: "edited", evidence_type: "explicit", confidence: "high" }, "edited");
        return tell(`Saved ${field.label}.`);
      },
    },
    confirm_field: {
      description: "Mark one unreviewed field as right as it stands: the person agreed with its value, or said there is none for an empty field.",
      schema: z.object({ field: fieldArg }),
      run: async (args) => {
        const field = open((args as { field: string }).field);
        if (typeof field === "string") return tell(field);
        await settle(field, { status: "approved" }, "approved");
        return tell(`Marked ${field.label} as right.`);
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
      run: async (args) => {
        const { url } = args as { url: string };
        if (ctx.hasVersion) return tell(WEBSITE_LOCKED);
        if (isBuilding(ctx)) return tell(WEBSITE_LOCKED_BUILDING);
        await actions.saveWebsite(url);
        ctx = { ...ctx, websiteUrl: url };
        changed = true;
        return tell("Saved the website.");
      },
    },
    save_socials: {
      description: "Save the brand's Instagram and/or Facebook handle. Pass only the ones the person gave.",
      schema: z.object({ instagram: z.string().min(1).max(200).optional(), facebook: z.string().min(1).max(200).optional() }),
      run: async (args) => {
        const handles = args as { instagram?: string; facebook?: string };
        if (!handles.instagram && !handles.facebook) return "No handle was given.";
        await actions.saveSocials(handles);
        ctx = { ...ctx, instagram: handles.instagram ?? ctx.instagram, facebook: handles.facebook ?? ctx.facebook };
        changed = true;
        return tell("Saved the handles.");
      },
    },
    start_build: {
      description: "Start building the brand KB from the saved sources. Only after the person has said to start.",
      schema: z.object({}),
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
        return tell("Started the build.");
      },
    },
    reply_choices: {
      description: "Offer the person's likely answers as buttons under your message. Short phrases they could send as they are.",
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

  const { text } = await runAgent({ model, system: kbCopilotSystem(input.ctx, review), messages, tools });
  // The model sometimes ends a turn without words. Say what the tools said, never a bare "Done."
  // that could follow a refusal.
  const reply = text === EMPTY_AGENT_REPLY && said.length > 0 ? said.join(" ") : text;
  return { reply, suggestions: choices ?? fallbackSuggestions(ctx), changed, walk };
}
