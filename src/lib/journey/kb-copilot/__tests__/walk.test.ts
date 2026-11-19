import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { walkOf } from "../walk";

const msg = (over: Partial<ThreadMessage>): ThreadMessage =>
  ({ id: "m", role: "assistant", content: "x", card: null, attachments: [], suggestions: [], createdAt: "", ...over });
const q = (field: string) => msg({ card: { kind: "question", field, label: field } });
const built = msg({ card: { kind: "status", lines: [] } });
const note = msg({ card: { kind: "note" } });

describe("walkOf", () => {
  it("a build resets what was asked; only the last message can be a pending question", () => {
    expect(walkOf([q("a"), built, q("b"), msg({ role: "user" }), q("c")])).toEqual({ asked: ["b", "c"], pending: "c" });
    expect(walkOf([q("b"), msg({})]).pending).toBeNull();
    expect(walkOf([q("b"), msg({ role: "user" })]).pending).toBeNull();
  });

  it("counts a field asked twice once", () => {
    expect(walkOf([q("a"), msg({ role: "user" }), msg({}), q("a")])).toEqual({ asked: ["a"], pending: "a" });
  });

  it("looks past notes: a save on the page neither answers a question nor resets the walk", () => {
    expect(walkOf([q("a"), note, note])).toEqual({ asked: ["a"], pending: "a" });
  });

  it("is empty for an empty thread", () => {
    expect(walkOf([])).toEqual({ asked: [], pending: null });
  });
});

// ── Task 6: what is asked next ────────────────────────────────────────────────

import type { ReviewField } from "../review";
import { QUESTION_PRIORITY } from "../review";
import { questionMessage, walkMessages, type TurnWalk } from "../walk";

const f = (path: string, over: Partial<ReviewField> = {}): ReviewField => ({
  path, module: "brand_voice", label: path, title: path, kind: "text", value: "x", inferred: true, status: "needs_review", ...over,
});
const turnOf = (over: Partial<TurnWalk> = {}): TurnWalk => ({ settled: [], skipped: false, more: false, stopped: false, ...over });
/** Eight unsettled fields, the first eight of the priority list. */
const eight = QUESTION_PRIORITY.slice(0, 8).map((p) => f(p));
const reviewed = (fields: ReviewField[], ...paths: string[]) => fields.map((x) => (paths.includes(x.path) ? { ...x, status: "approved" as const } : x));
const asksAbout = (messages: ReturnType<typeof walkMessages>) => messages.map((m) => (m.card?.kind === "question" ? m.card.field : m.content));

describe("questionMessage", () => {
  it("words a question from the field", () => {
    expect(questionMessage(f("target_audience.age_range", { title: "Audience & Casting · Age Range", value: "25 to 40" }))).toEqual({
      role: "assistant",
      content: 'Audience & Casting · Age Range: I inferred "25 to 40" and could not find it stated. Is that right?',
      suggestions: ["Yes, that's right", "Skip this one"],
      card: { kind: "question", field: "target_audience.age_range", label: "Audience & Casting · Age Range" },
    });
  });

  it("reads a list out in a sentence", () => {
    expect(questionMessage(f("target_audience.pain_points", { title: "Pain Points", kind: "list", value: ["a", "b", "c"] })).content)
      .toBe("Pain Points: I inferred a, b and c and could not find it stated. Is that right?");
  });

  it("asks what an empty field should be, and offers 'There is none'", () => {
    const m = questionMessage(f("compliance.disclaimers", { title: "Disclaimers", kind: "list", value: [], inferred: false }));
    expect(m.content).toBe("Disclaimers: I could not find this in the sources. What should it be?");
    expect(m.suggestions).toEqual(["There is none", "Skip this one"]);
  });

  it("cuts a long value", () => {
    const m = questionMessage(f("compliance.content_rules", { title: "Content Rules", value: "y".repeat(400) }));
    expect(m.content).toContain(`"${"y".repeat(280)}…"`);
  });
});

describe("walkMessages", () => {
  it("asks the first question when a build lands, and nothing when all was stated", () => {
    expect(asksAbout(walkMessages({ fields: eight, walk: { asked: [], pending: null }, turn: null }))).toEqual([QUESTION_PRIORITY[0]]);
    expect(walkMessages({ fields: eight.map((x) => ({ ...x, inferred: false })), walk: { asked: [], pending: null }, turn: null })).toEqual([]);
  });

  it("asks the next field after an answer", () => {
    const [a, b] = QUESTION_PRIORITY;
    expect(asksAbout(walkMessages({ fields: reviewed(eight, a), walk: { asked: [a], pending: a }, turn: turnOf({ settled: [a] }) }))).toEqual([b]);
  });

  it("asks the same question again when the person said something else", () => {
    const [a] = QUESTION_PRIORITY;
    expect(asksAbout(walkMessages({ fields: eight, walk: { asked: [a], pending: a }, turn: turnOf() }))).toEqual([a]);
  });

  it("moves on when the pending field was reviewed by hand", () => {
    const [a, b] = QUESTION_PRIORITY;
    expect(asksAbout(walkMessages({ fields: reviewed(eight, a), walk: { asked: [a], pending: a }, turn: turnOf() }))).toEqual([b]);
  });

  it("moves on after a skip without asking that field again", () => {
    const [a, b] = QUESTION_PRIORITY;
    expect(asksAbout(walkMessages({ fields: eight, walk: { asked: [a], pending: a }, turn: turnOf({ skipped: true }) }))).toEqual([b]);
  });

  it("stops after five and offers to keep asking", () => {
    const five = QUESTION_PRIORITY.slice(0, 5);
    const out = walkMessages({ fields: reviewed(eight, ...five), walk: { asked: five, pending: five[4] }, turn: turnOf({ settled: [five[4]] }) });
    expect(out).toEqual([{
      role: "assistant",
      content: "Those were the five I most needed. 3 more were inferred or empty. Shall I keep asking, or will you review the rest on the right?",
      suggestions: ["Keep asking", "I'll review the rest"],
    }]);
  });

  it("says 'was' for one more", () => {
    const five = QUESTION_PRIORITY.slice(0, 5);
    const six = eight.slice(0, 6);
    const out = walkMessages({ fields: reviewed(six, ...five), walk: { asked: five, pending: five[4] }, turn: turnOf({ settled: [five[4]] }) });
    expect(out[0].content).toContain("1 more was inferred or empty.");
  });

  it("keeps asking past five once asked to, and on every answer after that", () => {
    const five = QUESTION_PRIORITY.slice(0, 5);
    const [sixth, seventh] = QUESTION_PRIORITY.slice(5, 7);
    expect(asksAbout(walkMessages({ fields: reviewed(eight, ...five), walk: { asked: five, pending: null }, turn: turnOf({ more: true }) }))).toEqual([sixth]);
    expect(asksAbout(walkMessages({ fields: reviewed(eight, ...five, sixth), walk: { asked: [...five, sixth], pending: sixth }, turn: turnOf({ settled: [sixth] }) }))).toEqual([seventh]);
  });

  it("starts the walk on request when nothing has been asked yet", () => {
    expect(asksAbout(walkMessages({ fields: eight, walk: { asked: [], pending: null }, turn: turnOf({ more: true }) }))).toEqual([QUESTION_PRIORITY[0]]);
  });

  it("says so when nothing is left to ask", () => {
    const [a] = QUESTION_PRIORITY;
    const one = [f(a, { status: "approved" })];
    expect(walkMessages({ fields: one, walk: { asked: [a], pending: a }, turn: turnOf({ settled: [a] }) })).toEqual([
      { role: "assistant", content: "That is everything I was unsure about. The rest is a straight review on the right.", suggestions: [] },
    ]);
  });

  it("adds nothing after stop_asking, or when no walk is going", () => {
    const [a] = QUESTION_PRIORITY;
    expect(walkMessages({ fields: eight, walk: { asked: [a], pending: a }, turn: turnOf({ stopped: true }) })).toEqual([]);
    expect(walkMessages({ fields: eight, walk: { asked: [], pending: null }, turn: turnOf() })).toEqual([]);
  });
});


// ── The walk's own buttons, carried out by code (D507) ─────────────────────────

import { walkChoice } from "../walk";

describe("walkChoice", () => {
  const AGE = "target_audience.age_range";
  const review = { pending: AGE };
  it("reads a confirm or a 'there is none' as confirming the waiting field", () => {
    expect(walkChoice("Yes, that's right", review)).toEqual({ tool: "confirm_field", args: { field: AGE } });
    expect(walkChoice("There is none", review)).toEqual({ tool: "confirm_field", args: { field: AGE } });
  });
  it("reads skip, keep asking and stop as the walk's own tools", () => {
    expect(walkChoice("Skip this one", review)).toEqual({ tool: "skip_question", args: {} });
    expect(walkChoice("Keep asking", { pending: null })).toEqual({ tool: "keep_asking", args: {} });
    expect(walkChoice("Ask me the open questions", { pending: null })).toEqual({ tool: "keep_asking", args: {} });
    expect(walkChoice("I'll review the rest", { pending: null })).toEqual({ tool: "stop_asking", args: {} });
  });
  it("matches the button's words only, ignoring surrounding spaces", () => {
    expect(walkChoice("  Yes, that's right ", review)).toEqual({ tool: "confirm_field", args: { field: AGE } });
    expect(walkChoice("Yes, that's right, but it should say 30 to 45", review)).toBeNull();
    expect(walkChoice("yes", review)).toBeNull();
  });
  it("leaves a confirm or a skip to the model when no question is waiting, and everything when no KB is in review", () => {
    expect(walkChoice("Yes, that's right", { pending: null })).toBeNull();
    expect(walkChoice("Skip this one", { pending: null })).toBeNull();
    expect(walkChoice("Keep asking", null)).toBeNull();
  });
});
