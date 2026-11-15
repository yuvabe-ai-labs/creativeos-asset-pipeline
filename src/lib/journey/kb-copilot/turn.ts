import { z } from "zod";
import { EMPTY_AGENT_REPLY, runAgent, type AgentMessage, type AgentModel, type AgentTool } from "@/lib/journey/agent";
import type { Attachment, ThreadMessage } from "@/lib/journey/thread/schema";
import { BuildAlreadyRunningError } from "@/lib/kb/build-errors";
import { kbCopilotSystem } from "@/prompts/kb-copilot";
import { KB_CONVERSATION_WINDOW, KB_REPLY_CHOICE_MAX_CHARS, KB_REPLY_CHOICES_MAX } from "./constants";
import { canStartBuild, fallbackSuggestions, isBuilding, type KbContext } from "./context";

// One turn of the brand KB copilot: the agent's tools and the rules they enforce. The rules live
// here, in code, because the prompt can only ask (spec §6). The actions are passed in, so this
// file touches no database and is tested with a scripted model.

export { BuildAlreadyRunningError };

export type KbActions = {
  saveWebsite: (url: string) => Promise<void>;
  saveSocials: (handles: { instagram?: string; facebook?: string }) => Promise<void>;
  /** Throws BuildAlreadyRunningError when one is already running. */
  startBuild: () => Promise<void>;
};

const ALREADY_RUNNING = "A build is already running.";
const ALREADY_BUILT = "The brand KB is already built. Changes to it come in a later step.";
const NOTHING_TO_BUILD_FROM = "I need a website or at least one document first.";
const WEBSITE_LOCKED = "The website cannot be changed here once the KB is built.";
const WEBSITE_LOCKED_BUILDING = "The website cannot be changed while a build is running.";

function userContent(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const list = attachments.map((a) => `${a.name} (${a.kind})`).join(", ");
  return [text, `Attached: ${list}`].filter(Boolean).join("\n");
}

export async function runKbTurn(input: {
  ctx: KbContext; history: ThreadMessage[]; text: string; attachments: Attachment[];
  actions: KbActions; model: AgentModel;
}): Promise<{ reply: string; suggestions: string[]; changed: boolean }> {
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

  const tools: Record<string, AgentTool> = {
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

  const { text } = await runAgent({ model, system: kbCopilotSystem(input.ctx), messages, tools });
  // The model sometimes ends a turn without words. Say what the tools said, never a bare "Done."
  // that could follow a refusal.
  const reply = text === EMPTY_AGENT_REPLY && said.length > 0 ? said.join(" ") : text;
  return { reply, suggestions: choices ?? fallbackSuggestions(ctx), changed };
}
