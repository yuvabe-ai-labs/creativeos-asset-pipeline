import type { NewCopilotMessage } from "@/lib/db/copilot-messages";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { QUESTION_VALUE_MAX_CHARS, REVIEW_QUESTIONS_FIRST } from "./constants";
import { ASK_OPEN_CHOICE } from "./context";
import { isEmpty, unsettled, type ReviewField } from "./review";

// The review walk (brand KB spec §2.3): the copilot asks about the few fields it could not settle,
// one at a time. Code decides which field is asked, how the question is worded and when the walk
// stops; the model only reads the person's answer. Pure, and read back from the thread itself: no
// separate state is kept.

export type Walk = {
  /** The fields asked about since the last build, each once. */
  asked: string[];
  /** The field of the question that is still the last thing said; null when none is. */
  pending: string | null;
  /** The likely answers that waiting question offered (D533); empty when none is waiting. */
  answers: string[];
};

/** A build's own message carries a status card: a new build starts the walk again. A note (a save
 *  on the page) is looked past: it neither answers a question nor resets anything. */
export function walkOf(messages: ThreadMessage[]): Walk {
  let asked: string[] = [];
  let last: ThreadMessage | null = null;
  for (const m of messages) {
    if (m.card?.kind === "note") continue;
    last = m;
    if (m.role !== "assistant") continue;
    if (m.card?.kind === "status") asked = [];
    else if (m.card?.kind === "question" && !asked.includes(m.card.field)) asked.push(m.card.field);
  }
  const question = last && last.role === "assistant" && last.card?.kind === "question" ? last.card : null;
  return { asked, pending: question?.field ?? null, answers: question?.answers ?? [] };
}

// ── What is asked next ────────────────────────────────────────────────────────

export const CONFIRM_CHOICE = "Yes, that's right";
export const NONE_CHOICE = "There is none";
export const SKIP_CHOICE = "Skip this one";
export const KEEP_ASKING_CHOICE = "Keep asking";
export const REVIEW_REST_CHOICE = "I'll review the rest";

/** The walk's own buttons, read as the tool each one means (D519). Code offered them, for a field
 *  code knows, so code carries them out: the model is not asked what a fixed button means. Only the
 *  button's exact words count; anything else the person types is the model's to read. A confirm or
 *  a skip needs a waiting question, and nothing counts outside a review. */
export function walkChoice(
  text: string,
  review: { pending: string | null; answers?: string[] } | null,
): { tool: "confirm_field" | "skip_question" | "keep_asking" | "stop_asking" | "answer_field"; args: Record<string, unknown> } | null {
  if (!review) return null;
  const said = text.trim();
  const pending = review.pending;
  if ((said === CONFIRM_CHOICE || said === NONE_CHOICE) && pending) return { tool: "confirm_field", args: { field: pending } };
  if (said === SKIP_CHOICE && pending) return { tool: "skip_question", args: {} };
  if (said === KEEP_ASKING_CHOICE || said === ASK_OPEN_CHOICE) return { tool: "keep_asking", args: {} };
  if (said === REVIEW_REST_CHOICE) return { tool: "stop_asking", args: {} };
  // A likely answer the waiting question offered (D533): saved as the person's own answer.
  if (pending && review.answers?.includes(said)) return { tool: "answer_field", args: { field: pending, value: said } };
  return null;
}

/** What one turn did to the walk, as the tools recorded it. */
export type TurnWalk = {
  /** Fields the turn answered or confirmed. */
  settled: string[];
  /** The person passed on the pending question. */
  skipped: boolean;
  /** The person asked for questions (to start, or to go on past the first few). */
  more: boolean;
  /** The person asked for no more questions. */
  stopped: boolean;
};

const cut = (text: string) => (text.length > QUESTION_VALUE_MAX_CHARS ? `${text.slice(0, QUESTION_VALUE_MAX_CHARS)}…` : text);

function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One question about one field, worded by code so it only ever repeats what the KB holds. An empty
 *  field may offer likely answers, said to be guesses (D533, refining spec §6); an inferred one never
 *  does: the copilot offers no other value against what the KB holds. */
export function questionMessage(field: ReviewField, answers: string[] = []): NewCopilotMessage {
  const card = { kind: "question" as const, field: field.path, label: field.title };
  if (isEmpty(field.value)) {
    const asked = `${field.title}: I could not find this in the sources. What should it be?`;
    if (answers.length === 0) return { role: "assistant", card, suggestions: [NONE_CHOICE, SKIP_CHOICE], content: asked };
    return {
      role: "assistant", card: { ...card, answers }, suggestions: [...answers, NONE_CHOICE, SKIP_CHOICE],
      content: `${asked} Some likely answers are below, or type your own.`,
    };
  }
  const value = Array.isArray(field.value) ? cut(listInWords(field.value)) : `"${cut(String(field.value))}"`;
  return {
    role: "assistant", card, suggestions: [CONFIRM_CHOICE, SKIP_CHOICE],
    content: `${field.title}: I inferred ${value} and could not find it stated. Is that right?`,
  };
}

/** Whether any of these messages asks about an empty field, so likely answers will be looked for (D533). */
/** Whether a question about this field offers likely answers (D533): only an empty field, and never
 *  a Compliance Rules one, where a tap would make a guessed rule the brand's own (Cyril, 2026-11-25). */
export function offersAnswers(field: ReviewField): boolean {
  return isEmpty(field.value) && field.module !== "compliance";
}

export function needsAnswers(messages: NewCopilotMessage[], fields: ReviewField[]): boolean {
  return messages.some((m) => {
    const card = m.card;
    const field = card?.kind === "question" ? fields.find((f) => f.path === card.field) : undefined;
    return field !== undefined && offersAnswers(field);
  });
}

/** What code adds to the thread after a turn, or after a build lands (`turn: null`): the next
 *  question, the offer to stop after the first few, the "that is everything" line, or nothing.
 *  `fields` is the KB as it stands after the turn; `walk` is the thread as it stood before it. */
export function walkMessages(input: { fields: ReviewField[]; walk: Pick<Walk, "asked" | "pending">; turn: TurnWalk | null }): NewCopilotMessage[] {
  const { fields, walk, turn } = input;
  const candidates = unsettled(fields).filter((f) => !walk.asked.includes(f.path));
  if (turn === null) return candidates[0] ? [questionMessage(candidates[0])] : [];
  if (turn.stopped) return [];

  // The person said something else: the question still stands, so it is asked again.
  const pending = walk.pending ? fields.find((f) => f.path === walk.pending) : undefined;
  if (pending && pending.status === "needs_review" && !turn.settled.includes(pending.path) && !turn.skipped) {
    return [questionMessage(pending)];
  }

  // A walk is going when a question was waiting, or the person has just asked for questions.
  if (!turn.more && walk.pending === null) return [];
  if (candidates.length === 0) {
    return [{ role: "assistant", suggestions: [], content: "That is everything I was unsure about. The rest is a straight review on the right." }];
  }
  if (turn.more || walk.asked.length !== REVIEW_QUESTIONS_FIRST) return [questionMessage(candidates[0])];
  const n = candidates.length;
  return [{
    role: "assistant", suggestions: [KEEP_ASKING_CHOICE, REVIEW_REST_CHOICE],
    content: `Those were the five I most needed. ${n} more ${n === 1 ? "was" : "were"} inferred or empty. Shall I keep asking, or will you review the rest on the right?`,
  }];
}
