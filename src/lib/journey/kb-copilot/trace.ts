import type { TraceRecord } from "@/lib/journey/trace/recorder";

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
