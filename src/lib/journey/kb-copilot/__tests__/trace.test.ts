import { describe, expect, it } from "vitest";
import type { TraceRecord } from "../../trace/recorder";
import { kbTraceRow, kbTurnMarks, TRACE_MARK_LABEL } from "../trace";

const AGE = "target_audience.age_range";
const empty: TraceRecord = { sent: null, rounds: [], choice: null, refusals: [] };
const marks = (over: Partial<Parameters<typeof kbTurnMarks>[0]> = {}) =>
  kbTurnMarks({ record: empty, pending: null, settled: [], skipped: false, stopped: false, askedAgain: false, failed: false, ...over });

describe("kbTurnMarks", () => {
  it("marks a waiting question the turn did nothing about (the 'Confirmed that field.' bug)", () => {
    const record: TraceRecord = { ...empty, rounds: [{ text: "Confirmed that field.", calls: [], results: [], ms: 900 }] };
    expect(marks({ record, pending: AGE })).toEqual(["unanswered"]);
  });

  it("does not mark a question answered, skipped or stopped, or no question at all", () => {
    expect(marks({ pending: AGE, settled: [AGE] })).toEqual([]);
    expect(marks({ pending: AGE, skipped: true })).toEqual([]);
    expect(marks({ pending: AGE, stopped: true })).toEqual([]);
    expect(marks()).toEqual([]);
  });

  it("marks a thrown refusal and a returned one alike", () => {
    const thrown: TraceRecord = { ...empty, rounds: [{ text: "", calls: [{ id: "c1", name: "propose_change", args: {} }], results: [{ id: "c1", output: "Error: That is already the value." }], ms: 1 }] };
    expect(marks({ record: thrown })).toEqual(["refused"]);
    expect(marks({ record: { ...empty, refusals: ["No question is waiting."] } })).toEqual(["refused"]);
  });

  it("marks asked again and failed as told, in a fixed order", () => {
    expect(marks({ askedAgain: true, failed: true, record: { ...empty, refusals: ["x"] }, pending: AGE })).toEqual(["unanswered", "asked_again", "refused", "failed"]);
  });

  it("has the exact words for each mark", () => {
    expect(TRACE_MARK_LABEL).toEqual({ unanswered: "Question left unanswered", asked_again: "Asked again", refused: "Refused", failed: "Failed" });
  });
});

describe("kbTraceRow", () => {
  it("takes the line columns from the trace, the sent text cut to 200 characters", () => {
    const record: TraceRecord = {
      ...empty,
      rounds: [
        { text: "", calls: [{ id: "c1", name: "answer_field", args: {} }, { id: "c2", name: "reply_choices", args: {} }], results: [], ms: 5 },
        { text: "Saved.", calls: [], results: [], ms: 2 },
      ],
      choice: null,
    };
    const row = kbTraceRow({
      record, clientId: "c1", messageId: "m1", createdBy: "u1", marks: ["refused"],
      came: { text: "x".repeat(250), attachments: [], waiting: null, state: "in_review" },
      model: "gpt", code: { settled: [], added: [], card: false }, reply: "Saved.", ms: 1234, error: null,
    });
    expect(row).toMatchObject({ clientId: "c1", messageId: "m1", createdBy: "u1", marks: ["refused"], durationMs: 1234, tools: ["answer_field", "reply_choices"] });
    expect(row.sentText).toHaveLength(200);
    expect(row.trace.rounds).toHaveLength(2);
    expect(row.trace.came.text).toHaveLength(250);
  });

  it("names the tool a reply button ran", () => {
    const row = kbTraceRow({
      record: { ...empty, choice: { tool: "confirm_field", args: {}, output: "Marked Age as right." } }, clientId: "c1", messageId: null, createdBy: "u1", marks: [],
      came: { text: "Yes, that's right", attachments: [], waiting: AGE, state: "in_review" },
      model: null, code: { settled: [AGE], added: [], card: false }, reply: "Marked Age as right.", ms: 10, error: null,
    });
    expect(row.tools).toEqual(["confirm_field"]);
  });
});
