import { z } from "zod";

// The tool-calling loop every stage agent shares (D497). Pure: it imports no SDK, the model is
// passed in, and it does not know where it runs. A stage supplies the prompt and the tools.
//
// The model only ever says what it wants. This loop is what acts, and each tool's own code decides
// whether the action is allowed, so the rules that must hold live in the tools, not in the prompt.

export type AgentTool = { description: string; schema: z.ZodType; run: (args: unknown) => Promise<string> };
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
}) => Promise<{ text: string; calls: ToolCall[]; answer?: unknown }>;

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
}): Promise<{ text: string; ran: string[]; answer?: T }> {
  const { model, system, messages, answer } = input;
  const rounds: AgentRound[] = [];
  const ran: string[] = [];

  let reply = await model({ system, messages, tools: input.tools, rounds, answer });
  while (reply.calls.length > 0 && rounds.length < MAX_AGENT_ROUNDS) {
    const results: ToolResult[] = [];
    // One at a time, in the order asked: a later call may depend on what an earlier one saved.
    for (const call of reply.calls) {
      const { output, ok } = await runCall(call, input.tools);
      if (ok) ran.push(call.name);
      results.push({ id: call.id, output });
    }
    rounds.push({ calls: reply.calls, results });
    // After the last round the tools are taken away, so the model has to answer.
    const tools = rounds.length < MAX_AGENT_ROUNDS ? input.tools : {};
    reply = await model({ system, messages, tools, rounds, answer });
  }

  const text = reply.text.trim() || EMPTY_AGENT_REPLY;
  if (!answer) return { text, ran };
  const parsed = answer.safeParse(reply.answer);
  if (!parsed.success) throw new AgentAnswerError(parsed.error.message);
  return { text, ran, answer: parsed.data };
}
