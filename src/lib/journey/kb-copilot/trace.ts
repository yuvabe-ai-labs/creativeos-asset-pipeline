import type { TraceRecord } from "@/lib/journey/trace/recorder";
import { TRACE_SENT_TEXT_MAX_CHARS } from "./constants";

// What a brand KB turn's trace is marked with (turn traces spec §3.2, D509). The marks are about what
// the turn achieved, not which tools it touched: many right turns call no tool, so "called no tool"
// would mark them all. Pure.

export type TraceMark = "unanswered" | "asked_again" | "refused" | "failed";

export const TRACE_MARK_LABEL: Record<TraceMark, string> = {
  unanswered: "Question left unanswered",
  asked_again: "Asked again",
  refused: "Refused",
  failed: "Failed",
};

export function kbTurnMarks(i: {
  record: TraceRecord;
  /** The field of the question waiting when the turn began. */
  pending: string | null;
  settled: string[]; skipped: boolean; stopped: boolean;
  /** Code asked the waiting question again after the reply. */
  askedAgain: boolean;
  failed: boolean;
}): TraceMark[] {
  const marks: TraceMark[] = [];
  if (i.pending !== null && i.settled.length === 0 && !i.skipped && !i.stopped) marks.push("unanswered");
  if (i.askedAgain) marks.push("asked_again");
  const thrown = i.record.rounds.some((r) => r.results.some((x) => x.output.startsWith("Error:")));
  if (thrown || i.record.refusals.length > 0) marks.push("refused");
  if (i.failed) marks.push("failed");
  return marks;
}

/** A brand KB turn's whole trace (spec §3.1): what the loop and the turn reported, plus what came in
 *  and what code did around the model. */
export type TurnTrace = TraceRecord & {
  came: { text: string; attachments: { kind: string; name: string }[]; waiting: string | null; state: string };
  /** The model asked; null when no model was asked (a reply button). */
  model: string | null;
  /** What code did after the model: fields written, the messages it added after the reply (a
   *  question, a question asked again, the "that is everything" line), and whether a change card came. */
  code: { settled: string[]; added: string[]; card: boolean };
  reply: string; ms: number; error: string | null;
};

export type NewTurnTrace = {
  clientId: string; messageId: string | null; createdBy: string;
  sentText: string; tools: string[]; marks: TraceMark[]; durationMs: number; trace: TurnTrace;
};

/** The row a turn's trace is stored as: the line columns are taken from the trace itself. */
export function kbTraceRow(i: Omit<TurnTrace, keyof TraceRecord> & {
  record: TraceRecord; clientId: string; messageId: string | null; createdBy: string; marks: TraceMark[];
}): NewTurnTrace {
  const { record, clientId, messageId, createdBy, marks, ...rest } = i;
  const tools = [
    ...(record.choice ? [record.choice.tool] : []),
    ...record.rounds.flatMap((r) => r.calls.map((c) => c.name)),
  ];
  return {
    clientId, messageId, createdBy, marks, tools,
    sentText: rest.came.text.slice(0, TRACE_SENT_TEXT_MAX_CHARS),
    durationMs: Math.round(rest.ms),
    trace: { ...record, ...rest },
  };
}

/** One line of the Turns list: what the list shows, without the trace itself. */
export type TurnLine = {
  id: string; messageId: string | null; createdAt: string;
  sentText: string; tools: string[]; marks: TraceMark[]; durationMs: number;
};
