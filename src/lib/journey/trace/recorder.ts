import type { AgentMessage, ToolCall, ToolDefinition, ToolResult, TraceSink } from "../agent";

// A trace sink that keeps what a turn reports, in order, for the route to store once the turn is
// over (turn traces, D521). Pure: it stores nothing itself.

export type TraceRecord = {
  sent: { system: string; messages: AgentMessage[]; tools: ToolDefinition[] } | null;
  rounds: { text: string; calls: ToolCall[]; results: ToolResult[]; ms: number }[];
  choice: { tool: string; args: unknown; output: string } | null;
  refusals: string[];
};

export function traceRecorder(): TraceSink & { record: () => TraceRecord } {
  const rec: TraceRecord = { sent: null, rounds: [], choice: null, refusals: [] };
  return {
    sent: (s) => { rec.sent = s; },
    round: (r) => { rec.rounds.push(r); },
    choice: (c) => { rec.choice = c; },
    refused: (sentence) => { rec.refusals.push(sentence); },
    record: () => ({ ...rec, rounds: [...rec.rounds], refusals: [...rec.refusals] }),
  };
}
