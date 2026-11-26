import "server-only";
import { z } from "zod";
import type { NewCopilotMessage } from "@/lib/db/copilot-messages";
import type { RecordFor } from "@/lib/generations/record-for";
import { structuredCaller, type StructuredCall } from "@/lib/scripts/copilot/model";
import { KB_ANSWERS_SYSTEM, kbAnswersUser } from "@/prompts/kb-answer-options";
import { KB_ANSWERS_TIMEOUT_MS, KB_COPILOT_MODEL, KB_REPLY_CHOICE_MAX_CHARS, KB_REPLY_CHOICES_MAX } from "./constants";
import type { ReviewField } from "./review";
import { ASK_OPEN_CHOICE, START_BUILD_CHOICE } from "./context";
import { CONFIRM_CHOICE, KEEP_ASKING_CHOICE, NONE_CHOICE, REVIEW_REST_CHOICE, SKIP_CHOICE, offersAnswers, questionMessage } from "./walk";

// Likely answers for a question about an empty field (D533): one quick call per question, when it
// is asked. They never hold the question up: a failure or a slow answer gives none.

/** `recordFor` names whom the call's cost is recorded for (D560); without it nothing is recorded. */
type Deps = { call?: StructuredCall; timeoutMs?: number; recordFor?: RecordFor };

const answersSchema = z.object({ answers: z.array(z.string()) });
/** Compared without case or a closing full stop. */
const plain = (text: string) => text.trim().toLowerCase().replace(/[.!]+$/, "");
/** Never offered: a button code already reads (a tap would run that, not save the words), and a
 *  "none" answer, which the "There is none" button gives properly (review fix). */
const NOT_OFFERED = new Set([
  NONE_CHOICE, SKIP_CHOICE, CONFIRM_CHOICE, KEEP_ASKING_CHOICE, REVIEW_REST_CHOICE, ASK_OPEN_CHOICE, START_BUILD_CHOICE,
  "none", "n/a", "na", "not applicable", "nothing", "no",
].map(plain));

export async function suggestAnswers(field: ReviewField, kbText: string, deps: Deps = {}): Promise<string[]> {
  const call = deps.call ?? structuredCaller(KB_COPILOT_MODEL, deps.recordFor ? { recordFor: deps.recordFor, recordType: "copilot" } : {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), deps.timeoutMs ?? KB_ANSWERS_TIMEOUT_MS); });
  try {
    const answer = await Promise.race([
      call({ name: "likely_answers", system: KB_ANSWERS_SYSTEM, user: kbAnswersUser({ field: field.title, kbText }), schema: answersSchema }),
      late,
    ]);
    if (!answer) return [];
    const kept: string[] = [];
    for (const raw of answer.answers) {
      const text = raw.trim();
      if (!text || text.length > KB_REPLY_CHOICE_MAX_CHARS || NOT_OFFERED.has(plain(text)) || kept.includes(text)) continue;
      kept.push(text);
    }
    return kept.slice(0, KB_REPLY_CHOICES_MAX);
  } catch (e) {
    console.error("[kb-copilot] could not suggest answers", { field: field.path, error: e instanceof Error ? e.message : String(e) });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The walk's messages with likely answers laid onto each question about an empty field. Everything
 *  else passes through as it was. */
export async function withAnswers(messages: NewCopilotMessage[], fields: ReviewField[], kbText: string, deps: Deps = {}): Promise<NewCopilotMessage[]> {
  return Promise.all(messages.map(async (m) => {
    const card = m.card;
    const field = card?.kind === "question" ? fields.find((f) => f.path === card.field) : undefined;
    if (!field || !offersAnswers(field)) return m;
    return questionMessage(field, await suggestAnswers(field, kbText, deps));
  }));
}
