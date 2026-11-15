import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { FunctionTool, ResponseInputItem } from "openai/resources/responses/responses";
import { createOpenAI } from "@/lib/openai/server";
import type { AgentModel, ToolCall } from "./agent";

// The OpenAI adapter for the shared agent loop (D497): Responses API function tools. This is the
// thin edge the loop's tests do not cover; everything that decides anything lives in agent.ts.
// A second provider is a second adapter beside this file, never a change to the loop.

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // The tool's own schema rejects this and the model is told why.
    return {};
  }
}

/** One adapter per turn: it carries the model's own output items (its reasoning and its tool
 *  calls) from round to round, which the API needs back alongside each tool result. */
export function openaiAgentModel(modelId: string): AgentModel {
  const carried: ResponseInputItem[] = [];
  let roundsSent = 0;

  return async ({ system, messages, tools, rounds, answer }) => {
    for (const round of rounds.slice(roundsSent)) {
      for (const result of round.results) {
        carried.push({ type: "function_call_output", call_id: result.id, output: result.output });
      }
    }
    roundsSent = rounds.length;

    const functionTools: FunctionTool[] = Object.entries(tools).map(([name, tool]) => ({
      type: "function", name, description: tool.description,
      parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
      // Not strict: strict mode forbids optional arguments, and the loop validates every call anyway.
      strict: false,
    }));

    const response = await createOpenAI().responses.create({
      model: modelId,
      instructions: system,
      input: [...messages.map((m) => ({ role: m.role, content: m.content })), ...carried],
      tools: functionTools,
      ...(answer ? { text: { format: zodTextFormat(answer, "answer") } } : {}),
    });

    // Keep everything the model produced, so the next call can refer back to it.
    carried.push(...(response.output as ResponseInputItem[]));

    const calls: ToolCall[] = response.output.flatMap((item) =>
      item.type === "function_call" ? [{ id: item.call_id, name: item.name, args: parseArgs(item.arguments) }] : [],
    );
    const text = response.output_text ?? "";
    if (!answer || calls.length > 0) return { text, calls };
    // A structured reply arrives as JSON text; the loop checks it against the schema.
    return { text: "", calls, answer: parseArgs(text) };
  };
}
