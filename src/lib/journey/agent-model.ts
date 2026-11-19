import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
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

/** How long one model call may take. Five of them (four rounds and the forced answer) must fit
 *  inside the request that hosts the loop. */
const CALL_TIMEOUT_MS = 20_000;

/** It carries the model's own output items (its reasoning and its tool calls) from round to round,
 *  which the API needs back alongside each tool result. A call with no rounds starts a new turn,
 *  so one adapter can be reused, for example to retry after a reply that did not fit. */
/** The model's words. Each message it wrote is kept as its own paragraph: the SDK's `output_text`
 *  joins them with nothing between ("Confirmed that field.Got it."). */
function replyText(response: { output: { type: string; content?: unknown }[]; output_text?: string }): string {
  const messages = response.output.flatMap((item) => {
    if (item.type !== "message" || !Array.isArray(item.content)) return [];
    const text = (item.content as { type: string; text?: string }[])
      .filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
    return text.trim() ? [text.trim()] : [];
  });
  return messages.length > 0 ? messages.join("\n\n") : (response.output_text ?? "");
}

export function openaiAgentModel(modelId: string): AgentModel {
  const carried: ResponseInputItem[] = [];
  let roundsSent = 0;
  let lastTools: FunctionTool[] = [];

  return async ({ system, messages, tools, rounds, answer, onText }) => {
    if (rounds.length === 0) {
      carried.length = 0;
      roundsSent = 0;
      lastTools = [];
    }
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

    const body = {
      model: modelId,
      instructions: system,
      input: [...messages.map((m) => ({ role: m.role, content: m.content })), ...carried],
      // The loop takes the tools away to force an answer. Earlier calls in the input still refer to
      // them, so they stay declared and the model is told to call none.
      ...(functionTools.length > 0 ? { tools: functionTools } : lastTools.length > 0 ? { tools: lastTools, tool_choice: "none" as const } : {}),
      ...(answer ? { text: { format: zodTextFormat(answer, "answer") } } : {}),
    };
    const options = { timeout: CALL_TIMEOUT_MS, maxRetries: 0 };
    const client = createOpenAI();
    // The same request either way. With a listener the reply is streamed and each piece of text is
    // passed on as it is written (D502); the whole response is still what the rest of this reads.
    let response;
    if (onText) {
      // The SDK's own timeout stops at the first byte of a streamed answer, so a stream that stalls
      // half-way would hang the turn. This limit covers the whole reply.
      const streamed = client.responses.stream(body, { ...options, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      streamed.on("response.output_text.delta", (event) => onText(event.delta));
      response = await streamed.finalResponse();
    } else {
      response = await client.responses.create(body, options);
    }
    if (functionTools.length > 0) lastTools = functionTools;

    // Keep everything the model produced, so the next call can refer back to it. A streamed answer
    // comes back with fields only the SDK adds (parsed_arguments, parsed), which the API refuses as
    // input; this strips them, and leaves a plain answer as it is.
    carried.push(...toResponseInputItems(response.output));

    const calls: ToolCall[] = response.output.flatMap((item) =>
      item.type === "function_call" ? [{ id: item.call_id, name: item.name, args: parseArgs(item.arguments) }] : [],
    );
    const text = replyText(response);
    if (!answer || calls.length > 0) return { text, calls };
    // A structured reply arrives as JSON text; the loop checks it against the schema.
    return { text: "", calls, answer: parseArgs(text) };
  };
}
