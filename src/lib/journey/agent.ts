import { z } from "zod";

// The tool-calling loop every stage agent shares (D497). Pure: it imports no SDK, the model is
// passed in, and it does not know where it runs. A stage supplies the prompt and the tools.
//
// The model only ever says what it wants. This loop is what acts, and each tool's own code decides
// whether the action is allowed, so the rules that must hold live in the tools, not in the prompt.

export type AgentTool = {
  description: string; schema: z.ZodType; run: (args: unknown) => Promise<string>;
  /** A tool whose result needs no words from the model: when every call in a round is one of these
   *  and each ran without error, the turn ends there and the caller words the reply itself. */
  ends?: boolean;
  /** The line shown to the person while this tool runs ("Saving the website…"). Only tools that
   *  change what is on the page have one. */
  label?: string;
  /** A tool that needs nothing said back to the model (reply buttons). When the model has written
   *  its words and every call in that round is quiet and ran, those words are the reply: the model
   *  is not asked again, so the words are not cleared and written a second time. */
  quiet?: boolean;
};

/** What a turn reports while it runs (D502), for whoever is showing it. All optional: a turn with
 *  no listener runs exactly the same. `reset` means the words sent so far are not the reply after
 *  all, because the model went on to ask for a tool. */
export type AgentEvents = { text?: (delta: string) => void; reset?: () => void; step?: (label: string) => void };
export type AgentMessage = { role: "user" | "assistant"; content: string };
export type ToolCall = { id: string; name: string; args: unknown };
export type ToolResult = { id: string; output: string };
export type AgentRound = { calls: ToolCall[]; results: ToolResult[] };

export type AgentModel = (input: {
  system: string; messages: AgentMessage[]; tools: Record<string, AgentTool>;
  /** Earlier rounds of this turn: the calls the model made and what each returned. */
  rounds: AgentRound[];
  /** When set, the final reply must be this structure, not only words. */
  answer?: z.ZodType;
  /** When set, the model's words are passed here piece by piece as it writes them. */
  onText?: (delta: string) => void;
}) => Promise<{ text: string; calls: ToolCall[]; answer?: unknown }>;

/** A tool as the model is told about it: its name, description and JSON schema. The adapter sends
 *  exactly these, and a turn's trace keeps exactly these (D509). */
export type ToolDefinition = { name: string; description: string; parameters: Record<string, unknown> };

export function toolDefinitions(tools: Record<string, AgentTool>): ToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name, description: tool.description, parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
  }));
}

/** Where a turn reports what it did, as it does it (turn traces, D509). Reported as it happens, so a
 *  turn that fails half-way still leaves what it did up to then. */
export type TraceSink = {
  /** What the model was given, exactly: reported once, before the first call. */
  sent: (s: { system: string; messages: AgentMessage[]; tools: ToolDefinition[] }) => void;
  /** One model answer and the tools it asked for, with what each returned. No calls on the final answer. */
  round: (r: { text: string; calls: ToolCall[]; results: ToolResult[]; ms: number }) => void;
  /** A choice code carried out with no model call (a reply button, D507). */
  choice: (c: { tool: string; args: unknown; output: string }) => void;
  /** A tool refused what the model asked, in a sentence rather than an error. */
  refused: (sentence: string) => void;
};

/** The model's final structured answer did not fit what the caller asked for. */
export class AgentAnswerError extends Error {}

/** How many times the model may ask for tools in one turn before it has to answer. */
export const MAX_AGENT_ROUNDS = 4;

/** What a turn says when the model ends it with no words of its own. */
export const EMPTY_AGENT_REPLY = "Done.";

async function runCall(call: ToolCall, tools: Record<string, AgentTool>): Promise<{ output: string; ok: boolean }> {
  const tool = Object.hasOwn(tools, call.name) ? tools[call.name] : undefined;
  if (!tool) return { output: "Error: no such tool.", ok: false };
  const args = tool.schema.safeParse(call.args);
  if (!args.success) return { output: `Error: invalid arguments: ${args.error.message}`, ok: false };
  try {
    return { output: await tool.run(args.data), ok: true };
  } catch (error) {
    return { output: `Error: ${error instanceof Error ? error.message : String(error)}`, ok: false };
  }
}

/** Runs one turn: ask the model, run the tools it asks for, report back, repeat until it answers.
 *  `ran` names the tools that executed without error. With `answer`, the final reply is checked
 *  against it and returned as `answer`; a reply that does not fit throws AgentAnswerError. */
export async function runAgent<T = never>(input: {
  model: AgentModel; system: string; messages: AgentMessage[]; tools: Record<string, AgentTool>;
  answer?: z.ZodType<T>;
  on?: AgentEvents;
  trace?: TraceSink;
}): Promise<{ text: string; ran: string[]; answer?: T }> {
  const { model, system, messages, answer, on, trace } = input;
  const rounds: AgentRound[] = [];
  const ran: string[] = [];

  // Words are only passed on when somebody is listening and the reply is words: a structured
  // answer arrives as JSON, which is not something to show a person as it is written.
  let wrote = false;
  const onText = on?.text && !answer
    ? (delta: string) => {
        wrote = true;
        on.text?.(delta);
      }
    : undefined;

  trace?.sent({ system, messages, tools: toolDefinitions(input.tools) });
  // When the model call that produced the current reply started: a round's time runs from there to
  // the end of its tools.
  let started = Date.now();
  const ask = (tools: Record<string, AgentTool>) => {
    started = Date.now();
    return model({ system, messages, tools, rounds, answer, onText });
  };

  let reply = await ask(input.tools);
  while (reply.calls.length > 0 && rounds.length < MAX_AGENT_ROUNDS) {
    // Words beside quiet tools only (reply buttons) are already the reply, so they are kept.
    // Otherwise the model wrote something and then asked for a tool that needs an answer back:
    // those words were not its reply, and are cleared before the tools run.
    const quietRound = !answer && reply.text.trim() !== "" && reply.calls.every((call) => input.tools[call.name]?.quiet);
    if (wrote && !quietRound) {
      on?.reset?.();
      wrote = false;
    }
    const results: ToolResult[] = [];
    let allRan = true;
    // One at a time, in the order asked: a later call may depend on what an earlier one saved.
    for (const call of reply.calls) {
      const label = Object.hasOwn(input.tools, call.name) ? input.tools[call.name].label : undefined;
      if (label) on?.step?.(label);
      const { output, ok } = await runCall(call, input.tools);
      if (ok) ran.push(call.name);
      else allRan = false;
      results.push({ id: call.id, output });
    }
    rounds.push({ calls: reply.calls, results });
    trace?.round({ text: reply.text, calls: reply.calls, results, ms: Date.now() - started });
    // Nothing is left for the model to say after a round of tools that end the turn, so it is not
    // asked again. A failed call still goes back to it, and so does a turn that owes an answer.
    if (!answer && allRan && reply.calls.every((call) => input.tools[call.name]?.ends)) {
      return { text: reply.text.trim() || EMPTY_AGENT_REPLY, ran };
    }
    if (quietRound && allRan) return { text: reply.text.trim(), ran };
    // A quiet tool that failed goes back to the model, which writes its reply again.
    if (wrote) {
      on?.reset?.();
      wrote = false;
    }
    // After the last round the tools are taken away, so the model has to answer.
    const tools = rounds.length < MAX_AGENT_ROUNDS ? input.tools : {};
    reply = await ask(tools);
  }

  // The final answer is a round too, so a trace shows the words the turn ended on. A reply that still
  // asks for tools after the last round keeps its calls here, unrun, so the trace shows that too.
  trace?.round({ text: reply.text, calls: reply.calls, results: [], ms: Date.now() - started });
  const text = reply.text.trim() || EMPTY_AGENT_REPLY;
  if (!answer) return { text, ran };
  const parsed = answer.safeParse(reply.answer);
  if (!parsed.success) throw new AgentAnswerError(parsed.error.message);
  return { text, ran, answer: parsed.data };
}
